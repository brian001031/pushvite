import React, { useRef , useState , useEffect , useMemo, useCallback} from 'react';
import { Table } from 'react-bootstrap';
import api from '../api'; // 確保引入正確的 api 模組
import moment from 'moment';

const StickyScrollTable_Cathode = ({ 
  belowData = [], 
  selectReturnStatus, 
  setReturnStatus, 
  setCheckBoxStatus, 
  setBelowData, 
  finalData = {},
  collectWarningData
}) => {
  const stickyScrollRef = useRef();
  const tableScrollRef = useRef();
  
  const [loadingTankNoList, setLoadingTankNoList] = useState("");
  const [surgeTankList , setSurgeTankList] = useState("");
  const [memberName, setMemberName] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const localCathode = JSON.parse(localStorage.getItem("mixing_Cathode")) || [];
  const [warningDataList, setWarningDataList] = useState([]); // 收集所有警告資料



  // 同步滑動
  const handleStickyScroll = (e) => {
    tableScrollRef.current.scrollLeft = e.target.scrollLeft;
  };
  const handleTableScroll = (e) => {
    stickyScrollRef.current.scrollLeft = e.target.scrollLeft;
  };

  useEffect(() => {
    if (finalData && finalData.loadingTankNo) {
      setLoadingTankNoList(finalData.loadingTankNo);
    } else {
      setLoadingTankNoList(""); // 或給一個預設值
    }

     if (finalData && finalData.deviceNo_surgeTank) {
      setSurgeTankList(finalData.deviceNo_surgeTank);
    } else {
      setSurgeTankList(""); // 或給一個預設值
    }


  }, [finalData]);


  const dataFindWay = useCallback((option) => {
    if (!Array.isArray(belowData)) return null;

    switch (option) {
      case 'Nvalue':
        return belowData.map(item => item?.Nvalue ?? null);
      case 'Viscosity':
        return belowData.map(item => item?.Viscosity ?? null);
      case 'ParticalSize':
        return belowData.map(item => item?.ParticalSize ?? null);
      // case 'SolidContent':
        return belowData.map(item => item?.SolidContent ?? null);
      default:
        return null;
    }
  }, [belowData]);

  // 使用 useMemo 避免每次 render 都重新創建驗證規則物件
  const validationRules = useMemo(() => ({
    // N值設定
    Nvalue: {
      warning: { 
        min: typeof localCathode === "object" ? localCathode.Nvalue_Engineer_S : 0, 
        max: typeof localCathode === "object" ? localCathode.Nvalue_Engineer_E : 0,  
        message: 'N值必須在 ' + localCathode?.Nvalue_Engineer_S + '-' + localCathode?.Nvalue_Engineer_E + ' 之間 | Must between ' + localCathode?.Nvalue_Engineer_S + '-' + localCathode?.Nvalue_Engineer_E 
      },
      error: { min: 0, max: 1, message: "N值必需在 0-1 之間 | Must between 0-1" }
    },
    // 黏度設定
    Viscosity: {
      warning: {
        min: typeof localCathode === "object" ? localCathode.Viscosity_Engineer_S : 0, 
        max: typeof localCathode === "object" ? localCathode.Viscosity_Engineer_E : 0,  
        message: '黏度必須在 ' + localCathode?.Viscosity_Engineer_S + '-' + localCathode?.Viscosity_Engineer_E + ' 之間 | Must between ' + localCathode?.Viscosity_Engineer_S + '-' + localCathode?.Viscosity_Engineer_E 
      },
      error: { min: 1000, max: 7000, message: "黏度必需在 1000-7000 之間 | Must between 1000-7000" }
    },

    // 粒徑設定
    ParticalSize: {
      warning: {
        min: typeof localCathode === "object" ? localCathode.ParticalSize_Engineer_S : 0,
        max: typeof localCathode === "object" ? localCathode.ParticalSize_Engineer_E : 0,  
        message: `粒徑必須在 ${localCathode?.ParticalSize_Engineer_S}-${localCathode?.ParticalSize_Engineer_E} 之間 | Must between ${localCathode?.ParticalSize_Engineer_S}-${localCathode?.ParticalSize_Engineer_E}`
      },
      error: { min: 10, max: 30, message: "粒徑必需在 10-30 之間 | Must between 10-30" }
    },

    // 固含量設定
    SolidContent: {
      warning: {
        min: typeof localCathode === "object" ? localCathode.SolidContent_Engineer_S : 0, 
        max: typeof localCathode === "object" ? localCathode.SolidContent_Engineer_E : 0,  
        message: `固含量必須在 ${localCathode?.SolidContent_Engineer_S}-${localCathode?.SolidContent_Engineer_E} 之間 | Must between ${localCathode?.SolidContent_Engineer_S}-${localCathode?.SolidContent_Engineer_E}` 

      },
      error: { min: 50, max: 70, message: "固含量必需在 50-70 之間 | Must between 50-70" }
    },
      
  }), [
    localCathode?.Nvalue_Engineer_S,
    localCathode?.Nvalue_Engineer_E,
    localCathode?.Viscosity_Engineer_S,
    localCathode?.Viscosity_Engineer_E,
    localCathode?.ParticalSize_Engineer_S,
    localCathode?.ParticalSize_Engineer_E,
    localCathode?.SolidContent_Engineer_S,
    localCathode?.SolidContent_Engineer_E,
  ]);


  const statusCheck = (id) => {
    const errors = [];
    const dataItem = belowData.find(item => item.id === id);
    const lotNumber = dataItem ? dataItem.LotNo : 'Unknown LotNo';
    
    if (!dataItem) return null;

    // 收集該 id 的所有錯誤
    const currentErrors = [];

    for (let key in validationRules) {
      const value = parseFloat(dataItem[key]);
      
      if (isNaN(value) || value === null || value === undefined || dataItem[key] === '') {
        continue; // 跳過空值
      }

      const rules = validationRules[key];
      const warningMin = parseFloat(rules.warning.min);
      const warningMax = parseFloat(rules.warning.max);
      const errorMin = parseFloat(rules.error.min);
      const errorMax = parseFloat(rules.error.max);

      // 檢查錯誤範圍
      if (value < errorMin || value > errorMax) {
        errors.push({
          type: 'error',
          message: rules.error.message,
          field: key
        });
        
        // 收集錯誤資料
        currentErrors.push({
          id: id,
          lotNumber: lotNumber,
          errorPosition: key,
          errorText: rules.error.message,
          value: value
        });
      }
      // 檢查警告範圍
      else if (value < warningMin || value > warningMax) {
        errors.push({
          type: 'warning',
          message: rules.warning.message,
          field: key
        });
      }
    }

    // 如果有錯誤，通知父組件
    if (currentErrors.length > 0 && collectWarningData && typeof collectWarningData === 'function') {
      console.log('=== 子組件 StickyScrollTable_Cathode 發現錯誤 ===', currentErrors);
      console.log('collectWarningData 函數存在:', typeof collectWarningData);
      currentErrors.forEach(errorData => {
        console.log('正在通知父組件錯誤:', errorData);
        collectWarningData(errorData);
      });
    }

    // 更新驗證錯誤狀態
    setValidationErrors(prev => ({
      ...prev,
      [id]: errors
    }));

    return errors;
  }


  // 欄位數量
  const colCount = 33;

  useEffect(() => {
    if (memberName) {
      // 當 memberName 更新時，自動更新表格顯示
      console.log("memberName updated:", memberName);
    }
  }, [memberName])

  const fetchName = async (engineer_id, dataItem) => {
    try {
      console.log("Fetching name for engineer_id:", engineer_id);
      const response = await api.callgetEngineerName(engineer_id, null);
      console.log("API response:", response);
      
      if (response && response.data && response.data.data[0].memberName) {
        console.log("Found member name:", response.data.data[0].memberName);
        setMemberName(response.data.data[0]?.memberName);
        // 同時更新 belowData 以便 cathode 主程式使用
        setBelowData(prevData =>
          prevData.map(item =>
            item.id === dataItem.id ? { 
              ...item,
              Member01_Name: response.data.data[0]?.memberName,
              Member01_No: engineer_id 
            } : item
          )
        );
      } else {
        console.log("No member name found in response");
        setMemberName("");
      }
    } catch (error) {

     
      console.error("Error fetching name:", error);
      setMemberName("");
    }
  }

   const changeColor = (step) =>{
    switch (step){
      case "1":
      return { backgroundColor: '#198754' , fontSize: '1rem' , fontWeight: 'bold', alignItems: "center" , color : "#fff"};
      case "2":
      return { backgroundColor: '#0d6efd' , fontSize: '1rem' , fontWeight: 'bold', alignItems: "center" , color : "#fff"};
      case "3":
      return { backgroundColor: '#ffc107' , fontSize: '1rem' , fontWeight: 'bold', alignItems: "center" };
      case "4":
      return { backgroundColor: '#0dcaf0' , fontSize: '1rem' , fontWeight: 'bold', alignItems: "center" };
      
      default:
      return {};
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Sticky Scrollbar */}
      <div
        ref={stickyScrollRef}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 99,
          overflowX: 'auto',
          width: '100%',
          background: '#fff',
          height: 16,
        }}
        onScroll={handleStickyScroll}
      >
        <div style={{ width: '3000px', height: 1 }} />
      </div>
      {/* Table Scrollable Area */}
      <div
        ref={tableScrollRef}
        style={{ overflowX: 'auto', width: '100%' }}
        onScroll={handleTableScroll}
      >
        <Table
          bordered
          hover
          size="sm"
          className="cathode-table"
          style={{ marginTop: "2rem", minWidth: "3000px", borderCollapse: 'collapse', border: '1px solid #bbb' }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f8f9fa" }}>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>選擇<br />(Select)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>作業流程<br />(Now working process)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>生產型態<br />(Production type)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>配方編號 (Lot No.)<br/>(C674-機台-機台號-Recipe-日期-流水號)<br/>(C673-E-01-01-230615-01)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>N值 (N value)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>黏度(c.P.) Viscosity</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>粒徑(um) Partical size</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>固含量(%) Solid content</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>作業人員工號 (Operator ID)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>作業人員姓名 (Operator Name)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>下料桶槽 (the loading tank No.)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>暫存桶設備編號(surgeTank Device number)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>混漿設備編號(Mixing Device number)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>混漿起始時間 (Batch start time)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>混漿結束時間 (Batch end time)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>濾心目數 (Filter Mesh)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>輸送起始時間 (transport start time)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>輸送結束時間 (transport end time)</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>Machine Recipe</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>NMP1 Loading Weight</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>NMP2 Loading Weight</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>CNT1 Loading Weight</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>NMP-3</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>LFP1</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>Super P1</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>PVDF1</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>NMP1</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>CNT1</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>LFP2</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>Super P2</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>PVDF2</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>NMP2</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>CNT2</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>CNT3</th>
                <th style={{ whiteSpace: "nowrap", border: '1px solid #bbb' }}>CNT4</th>
            </tr>
          </thead>
          <tbody style={{ fontSize: "0.8rem", textAlign: "center" }}>
            {Array.isArray(belowData) && belowData.length > 0 ? (
              belowData.map((dataItem, index) => (
                <React.Fragment key={dataItem.id || index}>
                <tr>
                  <td style={{ border: '1px solid #bbb' }}>
                    <input
                      type="checkbox"
                      checked={selectReturnStatus === dataItem.ReturnStatus}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setReturnStatus(dataItem.ReturnStatus);
                          setCheckBoxStatus(true);
                        } else {
                          setReturnStatus('');
                          setCheckBoxStatus(false);
                        }
                      }}
                    />
                  </td>
                  <td style={changeColor(dataItem.System_Step)}>
                      {dataItem.System_Step}
                    </td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.ProductionType}</td>
                  <td style={{ border: '1px solid #bbb' , textWrap: 'wrap' }}>{dataItem.LotNo}</td>
                  {/* N 值提供 */}
                  <td style={{ border: '1px solid #bbb' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={dataItem.Nvalue || ""}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        // 只允許數字和小數點
                        if (newValue === '' || !isNaN(newValue)) {
                          setBelowData(prevData =>
                            prevData.map(item =>
                              item.id === dataItem.id ? { ...item, Nvalue: newValue } : item
                            )
                          );
                        }
                      }}
                      onBlur={() => statusCheck(dataItem.id)}
                      style={{
                        borderColor: validationErrors[dataItem.id]?.some(e => e.field === 'Nvalue' && e.type === 'error') ? 'red' :
                                     validationErrors[dataItem.id]?.some(e => e.field === 'Nvalue' && e.type === 'warning') ? 'orange' : ''
                      }}
                    />
                    {validationErrors[dataItem.id]?.filter(e => e.field === 'Nvalue').map((error, idx) => (
                      <div key={idx} style={{ 
                        color: error.type === 'error' ? 'red' : 'orange',
                        fontSize: '0.75rem',
                        marginTop: '2px'
                      }}>
                        {error.type === 'error' ? '❌' : '⚠️'} {error.message}
                      </div>
                    ))}
                  </td>
                  {/* 黏度值提供 */}
                  <td style={{ border: '1px solid #bbb' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={dataItem.Viscosity || ""}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        // 只允許數字和小數點
                        if (newValue === '' || !isNaN(newValue)) {
                          setBelowData(prevData =>
                            prevData.map(item =>
                              item.id === dataItem.id ? { ...item, Viscosity: newValue } : item
                            )
                          );
                        }
                      }}
                      onBlur={() => statusCheck(dataItem.id)}
                      style={{
                        borderColor: validationErrors[dataItem.id]?.some(e => e.field === 'Viscosity' && e.type === 'error') ? 'red' :
                                     validationErrors[dataItem.id]?.some(e => e.field === 'Viscosity' && e.type === 'warning') ? 'orange' : ''
                      }}
                    />
                    {validationErrors[dataItem.id]?.filter(e => e.field === 'Viscosity').map((error, idx) => (
                      <div key={idx} style={{ 
                        color: error.type === 'error' ? 'red' : 'orange',
                        fontSize: '0.75rem',
                        marginTop: '2px'
                      }}>
                        {error.type === 'error' ? '❌' : '⚠️'} {error.message}
                      </div>
                    ))}
                  </td>
                  {/* 粒徑提供 */}
                  <td style={{ border: '1px solid #bbb' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={dataItem.ParticalSize || ""}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        // 只允許數字和小數點
                        if (newValue === '' || !isNaN(newValue)) {
                          setBelowData(prevData =>
                            prevData.map(item =>
                              item.id === dataItem.id ? { ...item, ParticalSize: newValue } : item
                            )
                          );
                        }
                      }}
                      onBlur={() => statusCheck(dataItem.id)}
                      style={{
                        borderColor: validationErrors[dataItem.id]?.some(e => e.field === 'ParticalSize' && e.type === 'error') ? 'red' :
                                     validationErrors[dataItem.id]?.some(e => e.field === 'ParticalSize' && e.type === 'warning') ? 'orange' : ''
                      }}
                    />
                    {validationErrors[dataItem.id]?.filter(e => e.field === 'ParticalSize').map((error, idx) => (
                      <div key={idx} style={{ 
                        color: error.type === 'error' ? 'red' : 'orange',
                        fontSize: '0.75rem',
                        marginTop: '2px'
                      }}>
                        {error.type === 'error' ? '❌' : '⚠️'} {error.message}
                      </div>
                    ))}
                  </td>
                  {/* 固含量 */}
                  <td style={{ border: '1px solid #bbb' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={dataItem.SolidContent || ""}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        // 只允許數字和小數點
                        if (newValue === '' || !isNaN(newValue)) {
                          setBelowData(prevData =>
                            prevData.map(item =>
                              item.id === dataItem.id ? { ...item, SolidContent: newValue } : item
                            )
                          );
                        }
                      }}
                      onBlur={() => statusCheck(dataItem.id)}
                      style={{
                        borderColor: validationErrors[dataItem.id]?.some(e => e.field === 'SolidContent' && e.type === 'error') ? 'red' :
                                     validationErrors[dataItem.id]?.some(e => e.field === 'SolidContent' && e.type === 'warning') ? 'orange' : ''
                      }}
                    />
                    {validationErrors[dataItem.id]?.filter(e => e.field === 'SolidContent').map((error, idx) => (
                      <div key={idx} style={{ 
                        color: error.type === 'error' ? 'red' : 'orange',
                        fontSize: '0.75rem',
                        marginTop: '2px'
                      }}>
                        {error.type === 'error' ? '❌' : '⚠️'} {error.message}
                      </div>
                    ))}
                  </td>
                  {/* 作業人員工號 */}
                      <td style={{ border: '1px solid #bbb' }}>
                      <input
                        type="text"
                        value={dataItem.Member01_No || ""}
                        onChange={async (e) => {
                          const newValue = e.target.value;
                          setBelowData(prevData =>
                            prevData.map(item =>
                              item.id === dataItem.id ? { ...item, Member01_No: newValue } : item
                            )
                          );
                        }}
                        // 當輸入框失去焦點時觸發
                        onBlur={async (e) => {
                          const engineer_id = e.target.value.trim();
                          if (engineer_id) {
                            fetchName(engineer_id, dataItem);
                          }
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            const engineer_id = e.target.value.trim();
                            if (engineer_id) {
                              fetchName(engineer_id, dataItem);
                            }
                          }
                        }}
                        placeholder="Fill in ID to find name"
                      />
                      </td>
                  {/* 作業人員姓名 */}
                  <td style={{ border: '1px solid #bbb'  , width: '3rem' }}>
                    <input
                      type="text"
                      value={dataItem.Member01_Name || ""}
                      placeholder='Auto fill by ID'
                      style={{ width: '100%' , alignItems : "center" }}
                      disabled
                    />
                  </td>
                  {/* 下料桶槽 */}
                  <td colSpan={1}>
                      <input 
                          type="text" 
                          list="loadingTank" 
                          value={dataItem.loadingTankNo || "" }
                          onChange={(e) => {
                              const newValue = e.target.value;
                              setBelowData(prevData =>
                                  prevData.map(item =>
                                      item.id === dataItem.id ? { ...item, loadingTankNo: newValue } : item
                                  )
                              );
                          }}
                          />
                          <datalist id="loadingTank">
                              {
                                  (loadingTankNoList && typeof loadingTankNoList === 'string' ? loadingTankNoList.split(",") : 
                                  (belowData && belowData.loadingTankNo ? [belowData.loadingTankNo] : [])).map((tankNo, index) => (
                                      <option key={index} value={tankNo.trim()} />
                                  ))
                              } 
                          
                          </datalist>
                  </td>
                  {/* 暫存桶設備編號 */}
                  <td colSpan={1}>
                      <input 
                          type="text" 
                          list="deviceNo_surgeTank" 
                          value={dataItem.deviceNo_surgeTank || "" }
                          onChange={(e) => {
                              const newValue = e.target.value;
                              setBelowData(prevData =>
                                  prevData.map(item =>
                                      item.id === dataItem.id ? { ...item, deviceNo_surgeTank: newValue } : item
                                  )
                              );
                          }}
                      />
                      <datalist id="deviceNo_surgeTank">
                          {
                              (surgeTankList && typeof surgeTankList === 'string' ? surgeTankList.split(",") : 
                              (belowData && belowData.deviceNo_surgeTank ? [belowData.deviceNo_surgeTank] : [])).map((tankNo, index) => (
                                  <option key={index} value={tankNo.trim()} />
                              ))
                          } 
                      </datalist>
                  </td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.deviceNo_Mixing}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.BatchStart ? moment(dataItem.BatchStart).locale("zh-tw").format('YYYY-MM-DD HH:mm:ss') : ''}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.BatchEnd ? moment(dataItem.BatchEnd).locale("zh-tw").format('YYYY-MM-DD HH:mm:ss') : ''}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.Filter_Mesh}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.TransportStart ? moment(dataItem.TransportStart).locale("zh-tw").format('YYYY-MM-DD HH:mm:ss') : ''}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.TransportEnd ? moment(dataItem.TransportEnd).locale("zh-tw").format('YYYY-MM-DD HH:mm:ss') : ''}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.Recipe}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.NMP_1_Loading_Weight}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.NMP_2_Loading_Weight}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.CNT_1_Loading_Weight}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.NMP_3}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.LFP_1}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.SuperP_1}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.PVDF_1}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.NMP_1}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.CNT_1}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.LFP_2}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.SuperP_2}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.PVDF_2}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.NMP_2}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.CNT_2}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.CNT_3}</td>
                  <td style={{ border: '1px solid #bbb' }}>{dataItem.CNT_4}</td>
                </tr>
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={colCount} style={{ textAlign: "center", border: '1px solid #bbb' }}>目前沒有資料可顯示。</td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
};

export default StickyScrollTable_Cathode;
