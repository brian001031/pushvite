import React, { useState, useEffect, useCallback, useRef } from "react";
import debounce from "lodash.debounce";
import config from "../config";
import { Form, Button } from "react-bootstrap";
import axios from "axios";
import dayjs from "dayjs";
import Table from "react-bootstrap/Table";
import { Container, Row, Col } from "react-bootstrap";
import "./pfccsort_popform.scss";
//成功提示套件
import { toast } from "react-toastify";

const error_warn_number = parseInt("10");

//充放電選單
const trayid_ng_option = {
 "sulting_pf":["SECI_化成", "CHROMA_化成"] ,
 "sulting_cc":["SECI_未分選 ", "CHROMA_未分選 ", "SECI_32已分選 ", "CHROMA_32已分選"]
};

const titleMap = {
  "SECI_化成": [ "SECI_023_化成" , "📦"],
  "CHROMA_化成": ["CHROMA_023_化成","📦"],
  "SECI_未分選": ["SECI_010_分容" , "🌀"],
  "CHROMA_未分選":["CHROMA_010_分容" ,"💧"],
  "SECI_32已分選":[ "SECI_017_分容","🧊"],
  "CHROMA_32已分選": [ "CHROMA_017_分容" ,"⚙️"],
};

const mapping_col_ch = {
  FileName: "檔名",
  tray_label: "托盤治具號" ,
  PF_TYPE:"化成碼",
  CC_TYPE: "分容碼",
  V28_Null_None:"週期2異常",
  V32_Null_None:"週期4異常",
  V35_Null_None:"週期6異常",
  V2_0VAh_Zero_None : "週期1異常",
  V3_6VAh_Zero_None : "週期3異常",
  V3_5VAhcom_Zero_None: "週期5異常"
}

const NullError_Sort_Popform = ({side, closeModal }) => {
  const latestQueryRef = useRef(null);
  const [catch_tray_nglist  , setCatch_tray_nglist] = useState({
    PF_SECI:[],
    PF_CHROMA:[],
    CC1_SECI:[],
    CC1_CHROMA:[],
    CC2_SECI:[],
    CC2_CHROMA:[],
  }); //蒐集符合 NG tray list 

  const [pfcc_ng_collabel  , setPFCC_Ng_ColLabel] = useState([]); 
  const [select_Side, setselect_Side] = useState("");
  const [selectSideIndex, setSelectSideIndex] = useState(-1);  //一開始預設未選取
  const [visibleRows, setVisibleRows] = useState(20); // Initially show 20 rows
  const [trayid_loading, setTrayID_Loading] = useState(false);
  const [isbeforeLoading, setIsBeforeLoading] = useState(false);
  const [vender_grouptray, setSort_GroupTray] = useState({
    //化成pf type  
    SECI_化成: [],
    CHROMA_化成: [],

    // 分容cc type
    SECI_未分選: [],
    CHROMA_未分選: [],
    SECI_32已分選: [],
    CHROMA_32已分選: [],

  }); // 分組資料

  //初始先擷取side (sulting_pf化成 或 sulting_cc分容 ) 其中之一目前TrayID 有電容maH不良清單回前端渲染  
  useEffect(() => {

     //持續等待後端回應.....
     if(trayid_loading || isbeforeLoading){
      return;
     }

     const fetch_Sorting_TrayIDNg = async () => {  	  	  

      setTrayID_Loading(true);
      setIsBeforeLoading(true);

      try {    
            const res = await fetch(
            // `http://localhost:3009/scatterdigram/trayid_nglist?sidename=${side}`      
             `${config.apiBaseUrl}/scatterdigram/trayid_nglist?sidename=${side}`,
            );

          if (!res) throw new Error(`無擷取相關-> ${side}站不良托盤ID清單->電容量無效空值!`);

          const result = await res.json();

          //  console.log("目前接收 list 清單為= " + JSON.stringify(result,null,2));

          //清空列表單
          setCatch_tray_nglist({});

                 
          if (res.status === 200)
          {
                // Object.entries(result).forEach(([key, list]) => {
                //     console.log(`=== ${key} (${list.length}) ===`);
                //     console.table(list);
                // });

                //找尋第一組陣列(取鍵名list)
                const firstList = Object.values(result).find(
                    list => Array.isArray(list) && list.length > 0
                );

                const columns = firstList ? Object.keys(firstList[0]) : [];
                setPFCC_Ng_ColLabel(columns);

                //分選化成 或 分選分容
                const total_result = side.includes("sulting_pf")
                                    ? {
                                        PF_SECI: result.pf_SECI_traylist ?? [],
                                        PF_CHROMA: result.pf_CHROMA_traylist ?? [],
                                      }
                                    : {
                                        CC1_SECI: result.cc1_SECI_traylist ?? [],
                                        CC1_CHROMA: result.cc1_CHROMA_traylist ?? [],
                                        CC2_SECI: result.cc2_SECI_traylist ?? [],
                                        CC2_CHROMA: result.cc2_CHROMA_traylist ?? [],
                                    };

                setCatch_tray_nglist(prev => ({
                    ...prev,
                    ...total_result
                }));

                  // console.log("目前接收PF SECI trayID-NG 清單為= " + JSON.stringify(pf_Seci_traylist,null,2));
                  // console.log("目前接收PF CHROMA trayID-NG 清單為= " + JSON.stringify(pf_Chroma_traylist,null,2));

    
                 console.log("接收回傳存取進行中..");            
            // const serial_options = result.trayid_list.map((item, index) => ({
            //   prefix: item.model_prefix,
            //   num: index
            // }));
            // setCatch_tray_nglist(serial_options);
          }
      } catch (error) {
          console.error("Error fetching trayID include (MAH error) list:", error);
          return "";
      }	finally {
           const delay = 5 * 100; //延遲 500ms (約0.5秒)
           setTimeout(() => {
               setTrayID_Loading(false);
               setIsBeforeLoading(false);
           }, delay);
        }	 
    };
		
  fetch_Sorting_TrayIDNg();

  }, [side]);
 


  //確認FileNamelist 狀況
  useEffect(() => {
    if (side !== "sulting_pf" && side !== "sulting_cc") {
      toast.error("站別必須是 'sulting_pf' 或 'sulting_cc'");
      closeModal();
    }

    // console.log("實際收到數據流為:"+ JSON.stringify(catch_tray_nglist,null,2))


    const grouped = side === "sulting_pf"
                    ? {
                        SECI_化成: [],
                        CHROMA_化成: [],
                      }
                    : {
                        SECI_未分選: [],
                        CHROMA_未分選: [],
                        SECI_32已分選: [],
                        CHROMA_32已分選: [],
                      };

    //走訪原先結構
    Object.entries(catch_tray_nglist).forEach(([groupKey, trayList]) => {

       //針對groupKey 解取廠商
        const [, vender_name] = groupKey.split("_");
        
        trayList.forEach(row => {
            const op_type = row.PF_TYPE ?? row.CC_TYPE;
            const group = getSort_Electric_type(vender_name, op_type);
            grouped[group]?.push(row);
        });
     }          
    );

    // console.log("渲染前的組態總分配為:"+ JSON.stringify(grouped,null,2));
    setSort_GroupTray(grouped);
    // console.log("分組後的設備:", grouped);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catch_tray_nglist, side]);

  //解析Tray名稱屬於(哪間廠商)
  const parse_vender_electrictype = (item) => {
    let vender;
    const tray_id_struct  = String(item.tray_label).trim('').replace('\r', '');
    const tray_full_str =  tray_id_struct.split("-");    
    const first_field =  String(tray_full_str[0]).trim('');
    const last_field =  String(tray_full_str[tray_full_str.length - 1]).trim('');

    //分選化成
    if(side === "sulting_pf"){
      //ex: ( PF-08-K000011 或 FM19-PF00000007 ) -> 裁切'-'取第1個欄位字串 , PF開頭歸類 SECI , FM開頭歸類 CHROMA 
         vender = first_field.startsWith("PF") && (last_field.startsWith('K')|| last_field.startsWith('k'))
                  ? "SECI"
                  : first_field.startsWith("FM") && last_field.startsWith("PF")
                  ? "CHROMA"
                  : "未知廠商"
    }
    //分選分容
    else if(side === "sulting_cc"){
     //ex: ( CC-10-H000001 或 CC19-CC00000012 ) -> 裁切'-'取最後欄位字串 , H開頭歸類 SECI , CC開頭歸類 CHROMA 
         vender = last_field.startsWith('H')
                  ? "SECI"
                  : last_field.startsWith("CC")
                  ? "CHROMA"
                  : "未知廠商"
    }

    return {
      vender_name : vender,
      op_type : side === "sulting_pf" ? "PF": item.CC_TYPE,
      tray_serial: tray_id_struct,
    };
  };

  const toNumber = (str) => parseInt(str.replace("M", ""), 10);

  const getprefix_Width = (text) => {
      return `${text.length * 2.1 + 2}ch`;
  };

  //判定充電或放電狀態(其中一)
  const getprefix_dependon_pforcc = (sidename) => {
      return  sidename.includes("sulting_pf")?"充電":"放電";
  };

  //判斷是哪個(廠商與製成狀態)
  const getSort_Electric_type = (vender_name , op_type ) => {               
    const chbig5_utf8 =  op_type.includes("PF") 
                           ? "化成"
                           : parseInt(String(op_type).slice(-1)) === 1
                           ?  "未分選"
                           : parseInt(String(op_type).slice(-1)) === 2
                           ? "32已分選"
                           : "";

    if(vender_name && chbig5_utf8 !== "")
      return `${vender_name}_${chbig5_utf8}`;
    
    return "未知製程狀態"
  };

  const clearViewItems = (event) => {
    // 清空以下儲存內容數據
    // setRowcatch_num(0); // 若需要重設
    // setFirst_ID(0); // 若需要重設
    // setLast_ID(0); // 若需要重設
  };

  const isPositiveInteger = (value) => {
    const num = Number(value);
    return Number.isInteger(num) && num > 0;
  };

  const isLarge_compare_ID = (ST_ID, ED_ID) => {
    const start_ID = Number(ST_ID);
    const end_ID = Number(ED_ID);
    // console.log("比較大小 Start_ID = " + start_ID + " End_ID =  " + end_ID);
    return end_ID >= start_ID;
  };

  useEffect(() => {
    //setVisibleRows(20); // Reset visible rows when modal opens
    // console.log(
    //   "vender_grouptray changed:",
    //   JSON.stringify(vender_grouptray, null, 2)
    // );
 
  }, [vender_grouptray ]);

  const chunkArray = (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };


  // 處理按鈕點擊事件
  const handleButtonClick = (index) => {
    console.log("目前選擇為->:" + index);
	  const option_all_case = trayid_ng_option[String(side).trim('')] ??"";   
    
    // console.log("切換選單陣列為:"+option_all_case);
    // console.log("陣列為:"+ Array.isArray(option_all_case));
    // console.log("陣列長度為:"+ option_all_case.length );
    // console.log("切換站為:"+ option_all_case[index] );
    Array.isArray(option_all_case) && option_all_case.length > 0 ?setselect_Side(option_all_case[index]):setselect_Side("");
  };



  const HorizontalDeviceTable = ({ devices, groupSize = 3 }) => {
    const rows = chunkArray(devices, groupSize); // 每行 groupSize 組

    return (
      <Table
        striped
        bordered
        hover
        style={{
          textAlign: "center",
          verticalAlign: "middle",
          width: "100%",
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            {/* {Array.from({ length: groupSize }).map((_, i) => (
              <React.Fragment key={i}>
                <th>財產編號</th>
                <th>設備名稱</th>
              </React.Fragment>
            ))} */}
            { pfcc_ng_collabel.map(col => (
              <th key={col}
                  style={{
                    width:
                          col === "FileName"
                            ? devices.some(row => String(row.FileName).startsWith("CC"))
                              ? "240px"
                              : "180px"
                            : "120px",
                    whiteSpace: "normal",      // 允許換行
                    wordBreak: "break-word",   // 長單字可斷行
                    overflowWrap: "break-word",
                    padding: "8px",
                    textAlign: "center",
                    verticalAlign: "middle",
                    background:"#D3FF93"
                  }}
              >
                {col}{"|"}
                <span style={{ fontSize:"1.3rem",fontStyle:"bold" , color:"#000093"}}>
                {
                select_Side.includes("32")?          
                  mapping_col_ch[col].replace('5','7').trim(''):mapping_col_ch[col]                
                }
                </span>
              </th>
             ))
            }
          </tr>
        </thead>
        <tbody>
          {devices.map((row, Index) => (
            <tr key={Index}>
               {pfcc_ng_collabel.map(col =>  {                  
                   const value = row[col];
                   const isHighValue =
                      !isNaN(Number(value)) && Number(value) >= Number(error_warn_number);

                  return (
                   <React.Fragment>
                    <td key={col}
                      style={{
                        backgroundColor: isHighValue ? "#ff4d4f" : "",
                        color: isHighValue ? "#ebde2b" : "",
                        fontWeight: isHighValue ? "bold" : "normal",
                        fontSize: isHighValue ? "20px" : "16px",
                        textAlign: "center",
                        verticalAlign: "middle",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",                      
                        overflowWrap: "break-word",
                      }}                  
                     >{
                      (col === "FileName")? String(value??"").split(',').map((file,idx) => 
                        <React.Fragment key={idx}>
                          {file}
                         <br />
                      </React.Fragment>
                      )
                      :value}
                    </td>                   
                   </React.Fragment>
                  );
              })}
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  const handleScroll = (e) => {
    // console.log(
    //   e.target.scrollHeight,
    //   e.target.scrollTop,
    //   e.target.clientHeight
    // );

    const bottom =
      e.target.scrollTop + 5 + e.target.clientHeight >= e.target.scrollHeight;

    if (bottom) {
      console.log("Reached the bottom");
      setVisibleRows((prevVisibleRows) => prevVisibleRows + 20); // Load next 20 rows
    }
  };

  const handleCancel = () => {
    closeModal();

    // 重置表單（假設你有使用 useRef 取得 form DOM）
    // formRef.current?.reset();
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();

    //closeModal(); // Close the modal after submission
  };

  return (
    <div className="pfcc_trayng_display">
      <form onSubmit={handleSubmit}>
        <div className="modal-overlay">
          <div className="modal-container">
            <div style={{ display: "flex", justifyContent: "center" }}>
              <label
                style={{
                  fontWeight: "bold",
                  fontStyle: "normal",
                  paddingRight: "180px",
                  paddingTop: "20px",
                  fontSize: "41px",
                  // marginInline: "10px",
                }}
              ></label>

              <h3
                style={{
                  // justifycontent: "center",
                  // marginRight: "120px",
                  // paddingTop: "25px",
                  // fontSize: "45px",
                  // fontfamily: "Bungee Spice",
                  // color: "#FFFF00",
                  // backgroundColor: "#0000E3	",
                  marginTop: "35px",
                  marginRight: "120px",
                  paddingTop: "25px",
                  paddingLeft: "12px",
                  fontSize: "41px",
                  fontFamily: "Bungee Spice", // ← 注意這裡要大寫 F
                  color: "#FFFF00",
                  backgroundColor: "#0000E3",
                }}
              >
                {`${side}站:探測電容NG不良托盤清單▼`}
              </h3>
              <br />

              <button
                type="button"
                style={{ marginLeft: "100px", backgroundColor: "red" }}          
                onClick={() => handleCancel()}
              >
                關閉
              </button>
            </div>
            <div
              style={{
                maxHeight: "1000px",
                overflowY: "auto",
                display: "block",
                width: "100%", // Optional, set width if needed
                paddingBottom: "1150px", // ✅ 給所有內容一個統一的底部空間
              }}
            >
              <Container fluid>
              {trayid_loading && <p>Loading...</p>}                
                <div>
                    <div 
                         style={{
                          display: "flex",
                          alignItems: "center",
                          width: "100%",
                        }}
                     >
                      <label className="trayidlist_title_setting"
                              style={{ width: getprefix_Width(
                                !isbeforeLoading ? getprefix_dependon_pforcc(side)+"異常托盤ID序號":"托盤ID序號異常過濾中......"
                              )}}
                      >                 
                        {!isbeforeLoading ? getprefix_dependon_pforcc(side)+"異常托盤ID序號":"托盤ID序號異常過濾中......"} 
                      </label>
                      {!isbeforeLoading && 
                        <>
                              <h2
                                style={{
                                  marginLeft: "auto",
                                  textAlign: "center",
                                  width: "520px",
                                  fontSize: "30px",                                                            
                                  paddingRight:"1.5rem",
                                  border: "3px solid #33ee22",
                                  backgroundColor: "rgb(202, 217, 224)",
                                  // borderTop: "none",
                                }}
                              >
                                目前切換站為: {select_Side}
                              </h2>
                              <br />{" "}
                        </>
                      }   
                    </div>               
                  {isbeforeLoading ? (
                  <div className="loading-wrapper">
                    <div className="loading-spinner"></div>
                    {/* <span>托盤ID序號異常過濾中......</span> */}
                  </div>):(
                    <>  
                      <div
                        className="tab"
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          justifyContent: "flex-start",
                          flexWrap: "wrap",   // 若空間不足可換行
                        }}                        
                      >
                        {(trayid_ng_option[side] || []).map((label, index) => (
                          <button
                            key={index}
                            className={selectSideIndex === index ? "tray-btn active" : "tray-btn"}
                            style={{
                               // flex: 1,          // 每個按鈕平均分配
                              //  minWidth: "180px" // 避免太窄
                            }}                          
                            onClick={() => 
                                  {
                                    setSelectSideIndex(index);
                                    handleButtonClick(index);
                                  }
                            }
                          >
                            {label}
                          </button>
                        ))}
                        <label style={{ paddingRight: "15px", fontSize: "36px"  , transform: "translate(11%, 1%)"}}>
                           ←{" "}請選擇站別
                        </label>
                      </div>              
                    </>                      
                   )
                  }   
                </div>                                    
                {/* 化成一期 + 化成二期：左右欄 */}
                {/* {!trayid_loading && side === "sulting_pf" && (
                  <>
                    <Row>
                      <Col md={12}>
                        <h4 style={{ marginTop: "20px" }}>📦 SECI_23_PF化成站</h4>
                        <HorizontalDeviceTable
                          devices={vender_grouptray["SECI_化成"]}
                          groupSize={3}
                        />
                      </Col>
                      <Col md={12}>
                        <h4 style={{ marginTop: "20px" }}>📦 CHROMA_23_PF化成站</h4>
                        <HorizontalDeviceTable
                          devices={vender_grouptray["CHROMA_化成"]}
                          groupSize={3}
                        />
                      </Col>
                    </Row>
                  </>
                )}
                {!trayid_loading && side === "sulting_cc" && (
                  <>
                    <Row>
                      <Col md={15}>
                        <h4 style={{ marginTop: "20px" }}>🌀 SECI_未分選</h4>
                        <HorizontalDeviceTable
                          devices={vender_grouptray["SECI_未分選"]}
                          groupSize={3}
                        />
                      </Col>
                      <Col md={15}>
                        <h4 style={{ marginTop: "20px" }}>💧 CHROMA_未分選</h4>
                        <HorizontalDeviceTable
                          devices={vender_grouptray["CHROMA_未分選"]}
                          groupSize={3}
                        />
                      </Col>
                      <Col md={15}>
                        <h4 style={{ marginTop: "100px" }}>🧊 SECI_32已分選</h4>
                        <HorizontalDeviceTable
                          devices={vender_grouptray["SECI_32已分選"]}
                          groupSize={3}
                        />
                      </Col>
                      <Col md={15}>
                        <h4 style={{ marginTop: "100px" }}>
                          ⚙️ CHROMA_32已分選
                        </h4>
                        <HorizontalDeviceTable
                          devices={vender_grouptray["CHROMA_32已分選"]}
                          groupSize={3}
                        />
                      </Col>
                    </Row>                
                  </>
                )} */}
                {!trayid_loading && select_Side && (
                  <Row>
                      <Col md={12}>
                          <h4 style={{ marginTop: "20px" }}>
                              {titleMap[select_Side.trim()][0]} {titleMap[select_Side.trim()][1]}
                          </h4>

                          <HorizontalDeviceTable
                              devices={vender_grouptray[select_Side.trim()]}
                              groupSize={3}
                          />
                      </Col>
                  </Row>
                )}

              </Container>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default NullError_Sort_Popform;
