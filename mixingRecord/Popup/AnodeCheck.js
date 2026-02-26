import React, { useState, useEffect } from 'react';
import { Button, Table } from 'react-bootstrap';
import '../style.scss';
import moment from 'moment';
import { keyTranslations_mixing } from "../mixingdata"
import api from "../api"
import { use } from 'react';

const AnodeCheck = ({engineerDetail , operatorProfile , MixingSelect, onShowMessage}) =>{

    const [finalData, setFinalData] = useState({});
    const nowDate = new Date();

    const [selectReturnStatus, setReturnStatus] = useState('');
    const [checkBoxStatus, setCheckBoxStatus] = useState(false);
    const [loadingTankNoList, setLoadingTankNoList] = useState("");
    const [surgeTankList , setSurgeTankList] = useState("");
    const [errorText, setErrorText] = useState("");


    const [anodeInner , setAnodeInner] = useState({
            MixingSelect: "負極混漿",
            Graphite1_1: "",
            Graphite1_2: "",
            Super_P_1: "",
            Super_P_2: "",
            CMC_1: "",
            CMC_2: "",
            Graphite_2_1: "",
            Graphite_2_2: "",
            SBR_1: "",
            SBR_2: "",
            NMP_1_1: "",
            NMP_1_2: "",
            PAA_1: "",
            PAA_2: ""
        })

        const [belowData, setBelowData] = useState([]); 
            
       useEffect(() => {
        let sourceData = null;

        if (engineerDetail && Object.keys(engineerDetail).length > 0) {
            sourceData = engineerDetail;
        } else {
            const stored = localStorage.getItem('mixing_Anode');
            try {
                sourceData = stored ? JSON.parse(stored) : null;
            } catch (e) {
                console.error("mixing_Anode JSON parse error:", e);
                sourceData = {};
            }
        }

        if (localStorage.getItem('mixing_Anode') === null && !sourceData) {
            const errorMessage = "請先填寫工程師資訊！ Please fill in the engineer information first!";
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
            return;
        }

        const merged = {
            ...sourceData,
            ...operatorProfile,
        };

        setFinalData(merged);
    }, [engineerDetail, operatorProfile]);

    useEffect(() => {
        if (finalData && Object.keys(finalData).length > 0) {
            const dataToSubmit = { ...finalData, ...anodeInner };
            // localStorage.setItem('mixing_Cathode', JSON.stringify(dataToSubmit));
        }
    }, [anodeInner, finalData]);

    
    // 抓該電腦工程師所設定的下料桶槽、 暫存桶

    const fetchEngineerSetting = async () =>{
        
        const getLocalData = localStorage.getItem('mixing_Anode');
        // console.log("getLocalData:", getLocalData);

        if (!getLocalData) {
            const errorMessage = "請先填寫工程師資訊！ Please fill in the engineer information first!";
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
            return;
        }

        let parsedLocalData;
        try {
            parsedLocalData = JSON.parse(getLocalData);
        } catch (e) {
            const errorMessage = "工程師資訊格式錯誤，請重新填寫！ Engineer information format error, please fill it out again!";
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
            return;
        }

        try{
            const response = await api.call_getEngineerSetting(
                String(parsedLocalData.EngineerNo).trim(),
                String(MixingSelect).trim(),
            )
            console.log(
                "parsedLocalData.EngineerNo  :" ,
                String(parsedLocalData.EngineerNo).trim(),

                "MixingSelect  :" ,
                String(MixingSelect).trim(),

            )
            
            
            console.log("抓取工程師設定成功:", response.data);
            
            if (response?.data?.loadingTankNo !== "" ){
                setLoadingTankNoList(parsedLocalData.loadingTankNo);
            }
            if (response?.data?.deviceNo_surgeTank !== "" ){
                setSurgeTankList(parsedLocalData.deviceNo_surgeTank);
            }

            console.log("surgeTankList:", surgeTankList);

        }catch(error) {
            console.error("抓取工程師設定錯誤:", error);
            const errorMessage = "抓取工程師設定失敗，請稍後再試。 Failed to fetch engineer settings, please try again later.";
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
        }
    }

    
    // api抓取現有資料
    const fetchData = async () => {
        // 在發送請求前，確保 finalData 是可用的
        if (!finalData.EngineerName || !MixingSelect) {
            console.warn("finalData 未準備好，無法發送 API 請求:", finalData);
            setBelowData([]); // 在資料未準備好時，將 belowData 設定為空陣列
            return;
        }
        try {
            const response = await api.call_mixingInfo_CheckType(
                String(finalData.EngineerName).trim(),
                String(MixingSelect).trim(),
            );

            // 修正 setBelowData 的邏輯
            if (response?.data?.data) {
                setBelowData(Array.isArray(response.data.data) ? response.data.data : [response.data.data]);
                console.log("抓取資料成功:", response.data);
                const successMessage = "抓取資料成功! Data fetched successfully!";
                if (onShowMessage) onShowMessage('success', successMessage);
            } else {
                setBelowData([]); // 如果沒有資料或資料格式不符，設定為空陣列
                const errorMessage = "沒有可用的資料。 No available data.";
                setErrorText(errorMessage);
                if (onShowMessage) onShowMessage('error', errorMessage);
            }
            
            await fetchEngineerSetting(); // 確保在抓取資料後再抓取工程師設定
        } catch (error) {
            console.error("fetchData 錯誤:", error);
            setBelowData([]); // 發生錯誤時也設定為空陣列，避免渲染錯誤
        }
        
    };
    

    const updateData = async () => {

        const selectedItem = belowData.find(item => item.ReturnStatus === selectReturnStatus);
        console.log("selectedItem:", selectedItem);

        let innerSend = {
            MixingSelect,
            ...selectedItem
        }
        console.log("innerSend:", innerSend);

        if (!selectedItem) {
            const errorMessage = "請先選擇一筆資料。 Please select a record first.";
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
            return;
        }

        try{
            const response = await api.call_Post_mixingInfo_inner_post(innerSend);
            if (response.status === 200) {
                const successMessage = "更新資料成功！ Data submitted successfully!";
                if (onShowMessage) onShowMessage('success', successMessage);
                await fetchData()
            } else {
                const errorMessage = "更新資料失敗，請確認連線狀態。 Submit data failed, please check the connection status.";
                setErrorText(errorMessage);
                if (onShowMessage) onShowMessage('error', errorMessage);
            }
        }catch(error) {
            console.error("更新資料失敗:", error);
            const errorMessage = "更新資料失敗，請確認連線狀態。 Submit data failed, please check the connection status.";
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
        }
    }

    const handleFetchData = () => {
        if (finalData && Object.keys(finalData).length > 0) {
            fetchData();
        } else {
            const errorMessage = "請先在首頁設定工程師和操作員資訊。 Please set the engineer and operator information on the homepage first.";
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
        }
    }
        

    return (
        <div className="container" style={{margin : "0px", marginTop: "5vh" , padding: "0px", top: "0", left: "0", right: "0", bottom: "0" , marginLeft: "-5rem" }}>
                    <div className='title'>{MixingSelect}</div>
                    {
                        finalData && Object.keys(finalData).length > 0 ? (
                            <>
                            <Button style={{marginRight: "2rem"}} className='btn btn-dark' onClick={handleFetchData}>抓後台資料 | Fetching data </Button>
                            <Button onClick={updateData}>確認下料桶槽 | Submit the loading tank </Button>
                            
                            <div className='finallDisplay' style={{ overflow: "scroll"}}>
                            <Table striped hover bordered className="cathode-table" style={{ marginTop: "2rem" }}>
                                <thead style={{fontSize: "1rem", textAlign: "center"}}>
                                    <tr style={{ backgroundColor: "#f8f9fa" }}>
                                        <th colSpan={1} style={{ textWrap: "nowrap" }}>
                                            選擇<br />(Select)
                                        </th>
                                        <th style={{textWrap:"nowrap"}}>配方編號 (Lot No.)<br/>(C674-機台-機台號-Recipe-日期-流水號)<br/>(C673-E-01-01-230615-01)</th>
                                        <th style={{textWrap:"nowrap"}}>下料桶槽 (the loading tank No.)</th>
                                        <th style={{textWrap:"nowrap"}}>暫存桶設備編號(surgeTank Device number)</th>
                                        <th style={{ textWrap: "nowrap" }}>混漿設備編號 <br />(Mixing Device number)</th>
                                        <th style={{textWrap:"nowrap"}}>N值 (N value)</th>
                                        <th style={{textWrap:"nowrap"}}>黏度(c.P.) Viscosity</th>
                                        <th style={{textWrap:"nowrap"}}>粒徑(um) Partical size</th>
                                        <th style={{textWrap:"nowrap"}}>固含量(%) Solid content</th>
                                        <th style={{textWrap:"nowrap"}}>混漿起始時間 (Batch start time)</th>
                                        <th style={{textWrap:"nowrap"}}>混漿結束時間 (Batch end time)</th>
                                        <th style={{textWrap:"nowrap"}}>濾心目數 (Filter Mesh)</th>
                                        <th style={{textWrap:"nowrap"}}>輸送起始時間 (transport start time)</th>
                                        <th style={{textWrap:"nowrap"}}>輸送結束時間 (transport end time)</th>
                                        <th style={{textWrap:"nowrap"}}>輸送人員1 (2F)(Operator at 2F)</th>
                                        <th style={{textWrap:"nowrap"}}>輸送人員2 (1F)(Operator at 1F)</th>
                                        <th style={{textWrap: "noWrap"}}>Water-1 Loading Weight</th>
                                        <th style={{textWrap: "noWrap"}}>Water-2 Loading Weight</th>
                                        <th style={{textWrap: "noWrap"}}>Water-3 Loading Weight</th>
                                        <th style={{textWrap: "noWrap"}}>NMP</th>
                                        <th style={{textWrap: "noWrap"}}>Graphite1_1</th>
                                        <th style={{textWrap: "noWrap"}}>Super_P_1</th>
                                        <th style={{textWrap: "noWrap"}}>CMC_1</th>
                                        <th style={{textWrap: "noWrap"}}>Graphite2_1</th>
                                        <th style={{textWrap: "noWrap"}}>SBR_1</th>
                                        <th style={{textWrap: "noWrap"}}>Graphite1_2</th>
                                        <th style={{textWrap: "noWrap"}}>Super_P_2</th>
                                        <th style={{textWrap: "noWrap"}}>CMC_2</th>
                                        <th style={{textWrap: "noWrap"}}>Graphite2_2</th>
                                        <th style={{textWrap: "noWrap"}}>SBR_2</th>
                                        <th style={{textWrap: "noWrap"}}>NMP1_1</th>
                                        <th style={{textWrap: "noWrap"}}>NMP1_2</th>
                                        <th style={{textWrap: "noWrap"}}>PAA_1</th>
                                        <th style={{textWrap: "noWrap"}}>PAA_2</th>
                                    </tr>
                                </thead>
                                <tbody style={{ fontSize: "0.8rem", textAlign: "center"}}>
                                {Array.isArray(belowData) && belowData.length > 0 ? (
                                    belowData.map((dataItem, index) => (
                                        <tr key={dataItem.id || index}>
                                            <td>
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
                                            <td colSpan={1}>{dataItem.LotNo}</td>

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
                                                            (loadingTankNoList ? loadingTankNoList.split(",") : []).map((tankNo, index) => (
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
                                                        (surgeTankList ? surgeTankList.split(",") : []).map((tankNo, index) => (
                                                            <option key={index} value={tankNo.trim()} />
                                                        ))
                                                    } 
                                                </datalist>
                                            </td>
                                            <td colSpan={1}>{dataItem.deviceNo_Mixing}</td>
                                            <td colSpan={1}>{dataItem.Nvalue}</td>
                                            <td colSpan={1}>{dataItem.Viscosity} </td>
                                            <td colSpan={1}>{dataItem.ParticalSize}</td>
                                            <td colSpan={1}>{dataItem.SolidContent}</td>
                                            <td colSpan={1}>{dataItem.BatchStart ? moment(dataItem.BatchStart).format('YYYY-MM-DD HH:mm:ss') : ''}</td>
                                            <td colSpan={1}>{dataItem.BatchEnd ? moment(dataItem.BatchEnd).format('YYYY-MM-DD HH:mm:ss') : ''}</td>
                                            <td colSpan={1}>{dataItem.Filter_Mesh}</td>
                                            <td colSpan={1}>{dataItem.TransportStart ? moment(dataItem.TransportStart).format('YYYY-MM-DD HH:mm:ss') : ''}</td>
                                            <td colSpan={1}>{dataItem.TransportEnd ? moment(dataItem.TransportEnd).format('YYYY-MM-DD HH:mm:ss') : ''}</td>
                                            <td colSpan={1}>{dataItem.Member01_Name}| {dataItem.Member01_No}</td>
                                            <td colSpan={1}>{dataItem.Member02_Name}| {dataItem.Member02_No}</td>
                                            
                                            <td colSpan={1}>{dataItem.Water_1_LoadingWeight}</td>
                                            <td colSpan={1}>{dataItem.Water_2_LoadingWeight}</td>
                                            <td colSpan={1}>{dataItem.Water_3_LoadingWeight}</td>
                                            <td colSpan={1}>{dataItem.NMP}</td>
                                            <td colSpan={1}>{dataItem.Graphite1_1}</td>
                                            <td colSpan={1}>{dataItem.Super_P_1}</td>
                                            <td colSpan={1}>{dataItem.CMC_1}</td>
                                            <td colSpan={1}>{dataItem.Graphite_2_1}</td>
                                            <td colSpan={1}>{dataItem.SBR_1}</td>
                                            <td colSpan={1}>{dataItem.Graphite1_2}</td>
                                            <td colSpan={1}>{dataItem.Super_P_2}</td>
                                            <td colSpan={1}>{dataItem.CMC_2}</td>
                                            <td colSpan={1}>{dataItem.Graphite_2_2}</td>
                                            <td colSpan={1}>{dataItem.SBR_2}</td>
                                            <td colSpan={1}>{dataItem.NMP_1_1}</td>
                                            <td colSpan={1}>{dataItem.NMP_1_2}</td>
                                            <td colSpan={1}>{dataItem.PAA_1}</td>
                                            <td colSpan={1}>{dataItem.PAA_2}</td>  
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="30" style={{ textAlign: "center" }}>目前沒有資料可顯示。</td> {/* 根據您的欄位數量調整 colSpan */}
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>
                </>
            ) : (
                <div style={{ textAlign: "center", fontSize: "1.5rem", marginTop: "5rem" }}>
                    請先在首頁設定工程師和操作員資訊。
                </div>
            )
        }
    </div>
            );
}

export default AnodeCheck;

