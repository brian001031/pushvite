import { useState, useEffect, useRef } from 'react';
import { Button, Table, Modal, Form } from 'react-bootstrap';
import StickyScrollTable_Cathode from './StickyScrollTable_Cathode';
import '../style.scss';
import moment from 'moment';
// import { addPendingCathode, getPendingSubmissions, updateSubmissionStatus } from '../../../utils/indexeDb';
import DeleteModal from '../Popup/DeleteModal';

import api from "../api"

const Cathode = ({ 
    engineerDetail, 
    openMiddle , 
    MixingSelect, 
    ListNo_set, 
    onShowMessage,
    onChangeListNotify,
    listNoTrigger,
}) => {

    const [finalData, setFinalData] = useState({});
    const nowDate = new Date();
    const [deviceNo_Mixing, setDeviceNo_Mixing] = useState(''); 
    const [deviceNo_surgeTank, setDeviceNo_surgeTank] = useState('');
    const [selectReturnStatus, setReturnStatus] = useState(''); // 初始化為空字串，或您期望的預設值
    const [checkBoxStatus, setCheckBoxStatus] = useState(false);
    const [currentTime, setCurrentTime] = useState(moment().local("zh-tw").format("YYYY-MM-DD HH:mm:ss"));
    const [errorText, setErrorText] = useState("");
    
    const [selectedMixingDevice, setSelectedMixingDevice] = useState('');
    const [selectedSurgeTankDevice, setSelectedSurgeTankDevice] = useState('');
    const [selectReceipe, setSelectReceipe] = useState('');

    const [openDeleteModal, setOpenDeleteModal] = useState(false);
    const [updateData_Delete, setUpdateData_Delete] = useState({});
    
    // useRef 記錄上一次 fetchData 的依賴值，避免不必要的 API 呼叫
    const prevFetchDeps = useRef({ engineerName: null, mixingSelect: null });

    // 用於統整OP 輸入資料
    const [cathodeInner, setCathodeInner] = useState({
        MixingSelect: '正極混漿',
        BatchStart: nowDate,
        BatchEnd: '',
        TransportStart: '',
        TransportEnd: '',
        System_Step: '1',
        ReturnStatus: '',
        Member01_Name: '',
        Member01_No: '',
        Member02_Name: '',
        Member02_No: '',
        LFP_1: '',
        LFP_2: '',
        SuperP_1: '',
        SuperP_2: '',
        PVDF_1: '',
        PVDF_2: '',
        CNT_1: '',
        CNT_2: '',
        CNT_3: '',
        CNT_4: '',
        NMP_1: '',
        NMP_2: '',
    });


    // 用於存抓到的api 資訊
    const [belowData, setBelowData] = useState([]);
    const [checkQTY , setCheckQTY] = useState({
        toFinish : false 
    });
    const [faultyData , setFaultyData] = useState([]);
    const [finalOption , setFinalOption] = useState(''); // 用於紀錄送出產品是否有異常
    const [warningDataCollection, setWarningDataCollection] = useState([]); // 收集警告資料並儲存到 state 中

    
    // 每秒更新時間
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(moment().local("zh-tw").format("YYYY-MM-DD HH:mm:ss"));
        }, 1000);
        
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        console.log('useEffect for finalData triggered');
        console.log('localStorage mixing_Cathode:', localStorage.getItem('mixing_Cathode'));
        
        let sourceData = null;

        if (engineerDetail && Object.keys(engineerDetail).length > 0) {
            sourceData = engineerDetail;
        } else {
            const stored = localStorage.getItem('mixing_Cathode');
            try {
                sourceData = stored ? JSON.parse(stored) : null;
            } catch (e) {
                console.error("mixing_Cathode JSON parse error:", e);
                sourceData = {};
            }
        }

        if (localStorage.getItem('mixing_Cathode') === null && !sourceData) {
            const errorMessage = "請先填寫工程師資訊！Pls fill in the engineer information first!";
            setErrorText(errorMessage);
            if (onShowMessage) onShowMessage('error', errorMessage);
            return;
        }

        const merged = {
            ...sourceData,
        };

        console.log('merged:', merged);
        
        setFinalData(prev => {
            console.log('prev:', prev);
            const hasChanged = 
                prev.EngineerName !== merged.EngineerName ||
                prev.EngineerNo !== merged.EngineerNo ||
                prev.ProductionType !== merged.ProductionType ||
                prev.ListNo !== merged.ListNo;
            console.log('hasChanged:', hasChanged);
            if (hasChanged) {
                console.log('Setting new finalData:', merged);
                return merged;
            }
            console.log('No change, keeping prev');
            return prev;
        });
    }, [engineerDetail, onChangeListNotify, listNoTrigger]);

    useEffect(()=>{
        console.log('useEffect for fetchData triggered by onChangeListNotify');
        fetchData();
    },[onChangeListNotify, listNoTrigger])


    useEffect(() => {
        if (finalData && Object.keys(finalData).length > 0) {
            const dataToSubmit = { ...finalData, ...cathodeInner };
        }
    }, [cathodeInner, finalData]);


    // 混漿設備編號 帶動 配方編號變更
    useEffect(() => {
        if (finalData.deviceNo_Mixing && finalData.Recipe && selectedMixingDevice) {
            const mixingDevices = finalData.deviceNo_Mixing.split(",").map(d => d.trim());
            const recipeArr = finalData.Recipe.split(",").map(r => r.trim());
            let idx = mixingDevices.indexOf(selectedMixingDevice);
            if (idx < 0) idx = 0;
            setSelectReceipe(recipeArr[idx] || "");
        }
    }, [finalData.deviceNo_Mixing, finalData.Recipe, selectedMixingDevice]);

    // api抓取現有資料
    const fetchData = async () => {
        // 在發送請求前，確保 finalData 是可用的

        console.log("fetchData finalData:", finalData);
        
        let formattedTaiwanTime = '';
        if (!finalData.EngineerName || !MixingSelect) {
            console.warn("finalData 未準備好，無法發送 API 請求:", finalData);
            setBelowData([]); 
            return;
        }

        
        try {
            const response = await api.call_mixingInfo_inner_get(
                String(finalData.EngineerName).trim(),
                String(MixingSelect).trim(),
            );

            if (response.data.data.length === 0) {
                setErrorText("沒有找到相關資料！  Related data not found!");
                onShowMessage('error', "沒有找到相關資料！  Related data not found!");
                setBelowData([]); // 如果沒有資料，清空 belowData
                return;
            }

            // 修正 setBelowData 的邏輯
            if (response?.data?.data) {
                setBelowData(Array.isArray(response.data.data) ? response.data.data : [response.data.data]);
            } else {
                setBelowData([]); // 如果沒有資料或資料格式不符，設定為空陣列
            }
        } catch (error) {
            console.error("fetchData 錯誤:", error);
            setBelowData([]); // 發生錯誤時也設定為空陣列，避免渲染錯誤
        }
    };

    
        useEffect(() => {
            const currentEngineerName = finalData.EngineerName;
            const currentMixingSelect = MixingSelect;
            
            // 只有當 EngineerName 或 MixingSelect 變化時才執行 fetchData
            if (currentEngineerName && currentMixingSelect &&
                (prevFetchDeps.current.engineerName !== currentEngineerName ||
                 prevFetchDeps.current.mixingSelect !== currentMixingSelect)) {
                fetchData();
                prevFetchDeps.current = { engineerName: currentEngineerName, mixingSelect: currentMixingSelect };
            } else if (!currentEngineerName || !currentMixingSelect) {
                setBelowData([]);
            }
        }, [finalData.EngineerName, MixingSelect])



    
    const collectWarningData = (warningData) => {
        console.log('=== 父組件 Cathode 接收到警告資料 ===', warningData);
        setWarningDataCollection(prev => {
            // 檢查是否已存在相同的警告（避免重複）
            const exists = prev.some(item => 
                item.id === warningData.id && 
                item.errorPosition === warningData.errorPosition
            );
            if (!exists) {
                const newCollection = [...prev, warningData];
                console.log('警告資料已添加，目前總數:', newCollection.length, newCollection);
                return newCollection;
            }
            console.log('警告資料已存在，跳過添加');
            return prev;
        });
    }

    
    // 1. Step 1: 輸入配方編號與啟動時間
    const handleFirstStep = async (dataToSubmit , dataItem) => {

        // 檢查 cathodeInner 的必要欄位是否已填寫
        if (!cathodeInner.LFP_1 || 
            // !cathodeInner.LFP_2 || 
            !cathodeInner.SuperP_1 || 
            // !cathodeInner.SuperP_2 ||
            !cathodeInner.PVDF_1 || 
            // !cathodeInner.PVDF_2 || 
            !cathodeInner.CNT_1 || 
            // !cathodeInner.CNT_2 ||
            !cathodeInner.NMP_1 || 
            // !cathodeInner.NMP_2 ||
            selectedMixingDevice === "" ||
            selectedMixingDevice === null ||
            selectedMixingDevice === "choose device"
        ) {
            setErrorText("除暫存桶外，所有欄位皆需填寫完畢才可送出！All fields except surge tank must be filled in before submission!");
            onShowMessage('error', "除暫存桶外，所有欄位皆需填寫完畢才可送出！All fields except surge tank must be filled in before submission!");
            return;
        }

        // 生成當前時間
        const currentTime = moment().local("zh-tw").format("YYYY-MM-DD HH:mm:ss");
        
        let innerSend = {   
            BatchStart: currentTime,
            EngineerName: String(dataToSubmit.EngineerName).trim(),
            EngineerNo: String(dataToSubmit.EngineerNo).trim(),
            ProductionType: String(dataToSubmit.ProductionType).trim(),
            MixingSelect: String(MixingSelect).trim(),
            ReceipeNo: String(dataToSubmit.ReceipeNo).trim(),
            deviceNo_Mixing: String(selectedMixingDevice).trim(),
            deviceNo_surgeTank: String(selectedSurgeTankDevice).trim(),
            Recipe: String(selectReceipe).trim(),
            Filter_Mesh: String(dataToSubmit.Filter_Mesh).trim(),       
            batch_time_min_Smaller: String(dataToSubmit.batch_time_min_Smaller).trim(),
            batch_time_min_Bigger: String(dataToSubmit.batch_time_min_Bigger).trim(),
            NMP_1_Loading_Weight: String(dataToSubmit.NMP_1_Loading_Weight).trim(),
            NMP_2_Loading_Weight: String(dataToSubmit.NMP_2_Loading_Weight).trim(),
            CNT_1_Loading_Weight: String(dataToSubmit.CNT_1_Loading_Weight).trim(),
            NMP_3: String(dataToSubmit.NMP_3).trim(),
            ListNo: String(dataToSubmit.ListNo).trim(),
            System_Step: "1",
            Member01_No: "" ,
            Member01_Name:  "" ,
            LFP_1: String(cathodeInner.LFP_1).trim(),
            LFP_2: cathodeInner.LFP_2 ? String(cathodeInner.LFP_2).trim() : "",
            SuperP_1: String(cathodeInner.SuperP_1).trim(),
            SuperP_2: cathodeInner.SuperP_2? String(cathodeInner.SuperP_2).trim(): "",
            PVDF_1: String(cathodeInner.PVDF_1).trim(),
            PVDF_2: cathodeInner.PVDF_2 ? String(cathodeInner.PVDF_2).trim(): "",
            CNT_1: cathodeInner.CNT_1 ? String(cathodeInner.CNT_1).trim() : "",
            CNT_2: cathodeInner.CNT_2 ? String(cathodeInner.CNT_2).trim() : "",
            CNT_3: cathodeInner.CNT_3 ? String(cathodeInner.CNT_3).trim() : "",
            CNT_4: cathodeInner.CNT_4 ? String(cathodeInner.CNT_4).trim() : "",
            NMP_1: String(cathodeInner.NMP_1).trim(),
            NMP_2: cathodeInner.NMP_2 ? String(cathodeInner.NMP_2).trim() : "",
            LotNo: String(`${String(dataToSubmit.ReceipeNo).trim()}-E-${selectedMixingDevice}-${String(selectReceipe).trim()}-${moment().format("YYYYMMDD")}-${dataToSubmit.ListNo}`).trim(),
            ReturnStatus: cathodeInner.ReturnStatus && cathodeInner.ReturnStatus.trim() !== ""
            ? String(cathodeInner.ReturnStatus).trim()
            : String(Array.from({ length: 12 }, () => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789中文測試漢字';
                return chars.charAt(Math.floor(Math.random() * chars.length));
            }).join('')).trim(),
            errorReason: ''
        }

        try {
            const response = await api.call_Post_mixingInfo_inner_post(innerSend) // 等待 API 響應
            // 這裡可以根據 response 處理成功或失敗的邏輯
            if (response.status === 200) { 
                onShowMessage('success', "正極混漿啟動成功！ Cathode data has been successfully submitted!");

                // 更新 localStorage 中的 ListNo，自動增加1
                const mixingCathodeStr = localStorage.getItem('mixing_Cathode');
                if (mixingCathodeStr) {
                    const mixingCathode = JSON.parse(mixingCathodeStr);
                    const currentListNo = parseInt(dataToSubmit.ListNo, 10);
                    if (!isNaN(currentListNo)) {
                        const newListNo = currentListNo + 1;
                        mixingCathode.ListNo = newListNo.toString();
                        localStorage.setItem('mixing_Cathode', JSON.stringify(mixingCathode));
                        console.log("ListNo updated from", currentListNo, "to", newListNo);
                        
                        setFinalData(prevData => ({
                            ...prevData,
                            ListNo: newListNo.toString()
                        }));
                    }
                }

                    setCathodeInner({
                    BatchStart: '',
                    BatchEnd: '',
                    TransportStart: '',
                    TransportEnd: '',
                    System_Step: '1',
                    ReturnStatus: '',
                    LFP_1: '',
                    LFP_2: '',
                    SuperP_1: '',
                    SuperP_2: '',
                    PVDF_1: '',
                    PVDF_2: '',
                    CNT_1: '',
                    CNT_2: '',
                    CNT_3: '',
                    CNT_4: '',
                    NMP_1: '',
                    NMP_2: '',
                });


            } else {
                setErrorText("提交失敗，請檢查資料！ Submission failed, please check the data!");
                onShowMessage('error', "提交失敗，請檢查資料！ Submission failed, please check the data!");
            }

            await fetchData();
        } catch (error) {
            console.error("handleFirstStep error:", error);
            setErrorText("發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
            onShowMessage('error', "發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
        }
    }

    // 2. Step 2: 混漿結束時間
    const handleSecondStep = async (dataToSubmit) => {
        console.log("handleSecondStep dataToSubmit:", dataToSubmit);

        // 生成當前時間
        const currentTime = moment().local("zh-tw").format("YYYY-MM-DD HH:mm:ss");
        
        try {
            // 找到選中的資料項
            const selectedItem = belowData.find(item => item.ReturnStatus === selectReturnStatus) || {};

            const updateData = {
                ...selectedItem, 
                MixingSelect: String(MixingSelect).trim(),
                BatchEnd: currentTime,
                System_Step: '2',
                Nvalue: String(selectedItem.Nvalue || '').trim(),
                Viscosity: String(selectedItem.Viscosity || '').trim(),
                ParticalSize: String(selectedItem.ParticalSize || '').trim(),
                SolidContent: String(selectedItem.SolidContent || '').trim(),
                Member01_Name: String(selectedItem.Member01_Name || '').trim(),
                Member01_No: String(selectedItem.Member01_No || '').trim(),
                loadingTankNo: String(selectedItem.loadingTankNo || '').trim(),
                surgeTankDeviceNo: String(selectedItem.surgeTankDeviceNo || '').trim()
            };
            if (
                selectedItem.ReturnStatus &&
                String(selectedItem.System_Step).trim() === "1" &&
                (
                    !selectedItem.Viscosity 
                )
            ) {
                setErrorText("請填寫黏度(c.P.) Viscosity !!  Please fill in Viscosity(c.P.) ");
                onShowMessage('error', "請填寫黏度(c.P.) Viscosity !!  Please fill in Viscosity(c.P.) ");
                return;
            } else if (selectedItem.ReturnStatus &&
                String(selectedItem.System_Step).trim() !== "1"){
                setErrorText("混漿結束時間更新失敗，請確認作業流程狀態！ Mixing end time update failed, please check the process status!");
                onShowMessage('error', "混漿結束時間更新失敗，請確認作業流程狀態！ Mixing end time update failed, please check the process status!");
            }
            else if (
                selectedItem.ReturnStatus &&
                String(selectedItem.System_Step).trim() === "1"
            ){
                updateData.ReturnStatus = selectedItem.ReturnStatus;
                const response = await api.call_Post_mixingInfo_inner_post(updateData);
                if (response.status === 200) {
                    onShowMessage('success', "混漿結束時間已更新！ Mixing end time has been updated!");
                } else {
                    setErrorText("混漿結束時間更新失敗！ Mixing end time update failed!");
                    onShowMessage('error', "混漿結束時間更新失敗！ Mixing end time update failed!");
                }
            }

            await fetchData();
        } catch (error) {
            console.error("handleSecondStep error:", error);
            setErrorText("發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
            onShowMessage('error', "發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
        }
    }
    // 3. Step 3: 輸送起始時間 (transport start time)	
    const handleThiredStep = async (dataToSubmit) => {
        
        // 生成當前時間
        const currentTime = moment().local("zh-tw").format("YYYY-MM-DD HH:mm:ss");
        
        try {
            
            const selectedItem = belowData.find(item => item.ReturnStatus === selectReturnStatus) || {};

            const updateData = {
                ...selectedItem,
                Member01_Name: String(selectedItem.Member01_Name || '').trim(),
                Member01_No: String(selectedItem.Member01_No || '').trim(),
                MixingSelect: String(MixingSelect).trim(),
                TransportStart: currentTime,
                System_Step: '3',
                Nvalue: String(selectedItem.Nvalue || '').trim(),
                Viscosity: String(selectedItem.Viscosity || '').trim(),
                ParticalSize: String(selectedItem.ParticalSize || '').trim(),
                SolidContent: String(selectedItem.SolidContent || '').trim(),
                loadingTankNo: String(selectedItem.loadingTankNo || '').trim(),
                surgeTankDeviceNo: String(selectedItem.surgeTankDeviceNo || '').trim()
            };

            if(String(selectedItem.System_Step).trim() !== "2"){
                setErrorText("請依步驟進行！ Please follow the steps!");
                onShowMessage('error', "請依步驟進行！ Please follow the steps!");
                return;
            }
            else if (
                selectedItem.ReturnStatus &&
                String(selectedItem.System_Step).trim() === "2" &&
                (
                    !selectedItem.Viscosity ||
                    !selectedItem.Nvalue ||
                    !selectedItem.ParticalSize ||
                    !selectedItem.SolidContent ||
                    !selectedItem.Member01_Name ||
                    !selectedItem.Member01_No
                )
            ) {
                setErrorText("請填寫N值、粒徑、固含量、作業人員資訊。 Please fill in N value, particle size, solid content, and operator information.");
                onShowMessage('error', "請填寫N值、粒徑、固含量、作業人員資訊。 Please fill in N value, particle size, solid content, and operator information.");
                return;
            } else {
                updateData.ReturnStatus = selectedItem.ReturnStatus;
                const response = await api.call_Post_mixingInfo_inner_post(updateData);
                if (response.status === 200) {
                    onShowMessage('success', "運輸開始時間已更新！ Transport start time has been updated!");
                } else {
                    setErrorText("運輸開始時間更新失敗！ Transport start time update failed!");
                    onShowMessage('error', "運輸開始時間更新失敗！ Transport start time update failed!");
                }
            }

            await fetchData();
        } catch (error) {
            console.error("handleSecondStep error:", error);
            setErrorText("發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
            onShowMessage('error', "發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
        }
    }

    // 4. Step 4: 輸送結束時間 (transport end time)
    const handleFouthStep = async (dataToSubmit) => {
        
        // 生成當前時間
        const currentTime = moment().local("zh-tw").format("YYYY-MM-DD HH:mm:ss");

        try {
            

            // 找到選中的資料項
            const selectedItem = belowData.find(item => item.ReturnStatus === selectReturnStatus) || {};

            const updateData = {
                ...selectedItem, 
                MixingSelect: String(MixingSelect).trim(),
                TransportEnd: currentTime,
                System_Step: '4',
                Member01_Name: String(selectedItem.Member01_Name || '').trim(),
                Member01_No: String(selectedItem.Member01_No || '').trim(),
                loadingTankNo: String(selectedItem.loadingTankNo || '').trim(),
                surgeTankDeviceNo: String(selectedItem.surgeTankDeviceNo || '').trim()
            };

            if(String(selectedItem.System_Step).trim() !== "3"){
                setErrorText("請依步驟進行！ Please follow the steps!");
                onShowMessage('error', "請依步驟進行！ Please follow the steps!");
                return;
            }
            else if (selectedItem.ReturnStatus && selectedItem.System_Step.trim() === "3") {
                updateData.ReturnStatus = selectedItem.ReturnStatus;
                const response = await api.call_Post_mixingInfo_inner_post(updateData);
                if (response.status === 200) {
                    onShowMessage('success', "運輸結束時間更新成功！ Transport end time update sucessed!");
                }
            } else {
                setErrorText("運輸結束時間更新失敗！ Transport end time update failed!");
                onShowMessage('error', "運輸結束時間更新失敗！ Transport end time update failed!");
            }

            await fetchData();
        } catch (error) {
            console.error("handleSecondStep error:", error);
            setErrorText("發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
            onShowMessage('error', "發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
        }
    }

    // 5. Step 5: 儲存資料
    const handleFiveStep = async (dataToSubmit) => {

        // 先檢查必要條件，通過後才顯示彈窗
        const selectedItem = belowData.find(item => item.ReturnStatus === selectReturnStatus) || {};

        if (!selectedItem.System_Step || selectedItem.System_Step.trim() !== "4") {
            setErrorText("請先完成前面的步驟！ Please complete the previous steps first!");
            onShowMessage('error', "請先完成前面的步驟！ Please complete the previous steps first!");
            return;
        } else if (
            !selectedItem.loadingTankNo ||
            !selectedItem.deviceNo_surgeTank
        ) {
            setErrorText("請確認下料桶槽與暫存桶設備編號是否已經填寫完畢！ Please ensure that you have filled in the loading tank and surge tank device information!");
            onShowMessage('error', "請確認下料桶槽與暫存桶設備編號是否已經填寫完畢！ Please ensure that you have filled in the loading tank and surge tank device information!");
            return;
        }

        // 通過檢查，顯示選項彈窗
        setCheckQTY({ toFinish: true });
    }

    // 處理 Step 5 的實際送出
    const handleFiveStepSubmit = async () => {
        // 生成當前時間
        const currentTime = moment().local("zh-tw").format("YYYY-MM-DD HH:mm:ss");

        console.log('=== 準備提交到後端 ===');
        console.log('警告資料集合 warningDataCollection:', warningDataCollection);
        console.log('警告資料數量:', warningDataCollection.length);

        try {
            // 找到選中的資料項
            const selectedItem = belowData.find(item => item.ReturnStatus === selectReturnStatus) || {};
            
            const updateData = {
                ...selectedItem, 
                MixingSelect: String(MixingSelect).trim(),
                System_Step: '5',
                Member01_Name: String(selectedItem.Member01_Name || '').trim(),
                Member01_No: String(selectedItem.Member01_No || '').trim(),
                loadingTankNo: String(selectedItem.loadingTankNo || '').trim(),
                surgeTankDeviceNo: String(selectedItem.surgeTankDeviceNo || '').trim(),
                Date: currentTime,
                productStatus: finalOption, // 加入選擇的產品狀態
                warningData: JSON.stringify(warningDataCollection), // 加入警告資料
            };

            console.log('要送到後端的完整資料 updateData:', updateData);
            console.log('警告資料 JSON 字串:', updateData.warningData);

            if (selectedItem.ReturnStatus && selectedItem.System_Step && selectedItem.System_Step.trim() === "4") {
                updateData.ReturnStatus = selectedItem.ReturnStatus;
                const response = await api.call_Post_mixingInfo_inner_post(updateData);
                if (response.status === 200) {
                    onShowMessage('success', `資料已完整存取到資料庫！產品狀態: ${finalOption} | Data has been successfully stored in the database! Product status: ${finalOption}`);
                    setCheckQTY({ toFinish: false });
                    setFinalOption('');
                    setWarningDataCollection([]); // 清空警告資料
                    console.log('提交成功，已清空警告資料');
                }
            } else {
                setErrorText("資料完整性存取失敗！ Data integrity storage failed!");
                onShowMessage('error', "資料完整性存取失敗！ Data integrity storage failed!");
            }

            await fetchData();
        } catch (error) {
            console.error("handleSecondStep error:", error);
            setErrorText("發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
            onShowMessage('error', "發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
        }
    }

    // 刪除事件
    const handleSixStep = async (deleteReason) => {
        
        try{

            const selectedItem = belowData.find(item => item.ReturnStatus === selectReturnStatus) || {};
            
            const updateData = {
                ...selectedItem,
                MixingSelect: String(MixingSelect).trim(),
                ReturnStatus: selectReturnStatus,
                errorReason: String(deleteReason).trim(),
                System_Step: 'error',
            }
            

            const response = await api.call_Post_mixingInfo_inner_post(updateData);
            if (response.status === 200) {
                onShowMessage('success', "資料已成功刪除！ Data has been successfully deleted!");
            }

            console.log("handleSixStep response:", response + " |  errorReason 資料" , String(deleteReason).trim());
        }catch (error) {
            console.error("handleSixStep error:", error);
            setErrorText("發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
            onShowMessage('error', "發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
        }

        setOpenDeleteModal(false);
        await fetchData();
    }
        // 刪除事件
        
    const handleDeleteConfirm = () => {
        try{
            
            const selectedItem = belowData.find(item => item.ReturnStatus === selectReturnStatus) || {};

            if (!selectReturnStatus) {
                setErrorText("請先選擇要刪除的批次！ Please select a batch to delete first!");
                onShowMessage('error', "請先選擇要刪除的批次！ Please select a batch to delete first!");
                return;
            }

            setOpenDeleteModal(true);
            setUpdateData_Delete(selectedItem);
        }catch(error) {
            console.error("handleDeleteConfirm error:", error);
            setErrorText("發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
            onShowMessage('error', "發生錯誤，請確認連線狀態！ An error occurred, please confirm connection status!");
        }
    }

    // 清除 ListNo
    const handleCleanListNo = () => {
        if (!window.confirm("清除 ListNo 將會重置 ListNo 為 1，請確認是否要繼續！\n\nThis will reset ListNo to 1, please confirm if you want to continue!")) {
            return;
        }
        const newData = localStorage.getItem('mixing_Cathode');
        if (newData) {
            const parsedData = JSON.parse(newData);
            if (parsedData && parsedData.ListNo) {
                const currentListNo = parseInt(parsedData.ListNo, 10);
                if (!isNaN(currentListNo)) {
                    const newListNo = 1 ;
                    parsedData.ListNo = newListNo.toString();
                    localStorage.setItem('mixing_Cathode', JSON.stringify(parsedData));
                    setFinalData(prevData => ({
                        ...prevData,
                        ListNo: newListNo.toString()
                    }));
                    onShowMessage('success', "ListNo 已更新！ ListNo has been updated!");
                } else {
                    setErrorText("無效的 ListNo！ Invalid ListNo!");
                    onShowMessage('error', "無效的 ListNo！ Invalid ListNo!");
                }
            } else {
                setErrorText("無法讀取 ListNo！ Cannot read ListNo!");
                onShowMessage('error', "無法讀取 ListNo！ Cannot read ListNo!");
            }
        }
    }

    const handleSubmit = (e, step) => {
        e.preventDefault();

        if (!finalData || Object.keys(finalData).length === 0) {
            setErrorText("請先填寫工程師資訊和操作員資訊！ Please fill in the engineer and operator information first!");
            onShowMessage('error', "請先填寫工程師資訊和操作員資訊！ Please fill in the engineer and operator information first!");
            return;
        }

        // 將 cathodeInner 合併到 finalData 中
        const dataToSubmit = { ...finalData, ...cathodeInner };
        // 儲存到 localStorage
        // localStorage.setItem('mixing_Cathode', JSON.stringify(dataToSubmit));

        switch (step) {
            case "1":
                handleFirstStep(dataToSubmit)
                console.log("Step 1: 輸入配方編號與啟動時間");
                break;
            case "2":
                // 在執行 Step 2 之前，確保有選中 ReturnStatus
                if (!selectReturnStatus) {
                    setErrorText("請先選擇要更新的批次！ Please select a batch to update first!");
                    onShowMessage('error', "請先選擇要更新的批次！ Please select a batch to update first!");
                    return;
                }
                handleSecondStep(dataToSubmit);
                console.log("Step 2: 混漿結束時間");
                break;
            case "3":
                // 在執行 Step 3 之前，確保有選中 ReturnStatus
                if (!selectReturnStatus) {
                    setErrorText("請先選擇要更新的批次！ Please select a batch to update first!");
                    onShowMessage('error', "請先選擇要更新的批次！ Please select a batch to update first!");
                    return;
                }
                handleThiredStep(dataToSubmit);
                console.log("Step 3: 輸送起始時間");
                break;
            case "4":
                // 在執行 Step 4 之前，確保有選中 ReturnStatus
                if (!selectReturnStatus) {
                    setErrorText("請先選擇要更新的批次！ Please select a batch to update first!");
                    onShowMessage('error', "請先選擇要更新的批次！ Please select a batch to update first!");
                    return;
                }
                handleFouthStep(dataToSubmit);
                console.log("Step 4: 輸送結束時間");
                break;
            case "5":
                // 在執行 Step 5 之前，確保有選中 ReturnStatus
                if (!selectReturnStatus) {
                    setErrorText("請先選擇要更新的批次！ Please select a batch to update first!");
                    onShowMessage('error', "請先選擇要更新的批次！ Please select a batch to update first!");
                    return;
                }
                handleFiveStep(dataToSubmit);
                console.log("Step 5: 儲存資料");
                break;
            case "6": 
                handleDeleteConfirm();
                break;
            case "7":
                handleCleanListNo();
                break;
            default:
                console.error("尚未有作業步驟 : ", step);
                return;
        }

    }

    const handleBackEngineerSet = () => {
        openMiddle();
    }

    const handleSettingListNo = () => {
        console.log("handleSettingListNo called");
        ListNo_set(MixingSelect);
    }

    const handleBack = (e) => {
        const selectedItem = belowData.find(item => item.ReturnStatus === selectReturnStatus) || {};
        
        if (!selectedItem || Object.keys(selectedItem).length === 0) {
            setErrorText("請先選擇要返回的批次！ Please select a batch to return first!");
            onShowMessage('error', "請先選擇要返回的批次！ Please select a batch to return first!");
            return;
        }
        if (selectedItem.System_Step != "1") {
            setErrorText("此資料已經過了第一階段 不可返回！ This data has already passed the first stage and cannot be returned!");
            onShowMessage('error', "此資料已經過了第一階段 不可返回！ This data has already passed the first stage and cannot be returned!");
            return;
        }
        
        setCathodeInner({
            MixingSelect: MixingSelect || '正極混漿',
            LFP_1: selectedItem.LFP_1 || '',
            LFP_2: selectedItem.LFP_2 || '',
            SuperP_1: selectedItem.SuperP_1 || '',
            SuperP_2: selectedItem.SuperP_2 || '',
            PVDF_1: selectedItem.PVDF_1 || '',
            PVDF_2: selectedItem.PVDF_2 || '',
            CNT_1: selectedItem.CNT_1 || '',
            CNT_2: selectedItem.CNT_2 || '',
            CNT_3: selectedItem.CNT_3 || '',
            CNT_4: selectedItem.CNT_4 || '',
            NMP_1: selectedItem.NMP_1 || '',
            NMP_2: selectedItem.NMP_2 || '',
            ListNo: selectedItem.ListNo || '',
            ReturnStatus: selectedItem.ReturnStatus,
        })
        setDeviceNo_Mixing(selectedItem.deviceNo_Mixing || '');
        setDeviceNo_surgeTank(selectedItem.deviceNo_surgeTank || '');


    }



    return (

        
        <div className="container" style={{ margin: "0px", marginTop: "5vh", padding: "0px", top: "0", left: "0", right: "0", bottom: "0", marginLeft: "-5rem" }}>
            {
            checkQTY.toFinish === true ? (
                <Modal show={checkQTY.toFinish} onHide={() => setCheckQTY({ toFinish: false })} centered>
                <Modal.Header closeButton>
                    <Modal.Title>選擇選項 | Select Option</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Group>
                            <Form.Label className="mb-3">請選擇一個選項 | Please select an option:</Form.Label>
                            <Form.Check 
                                type="radio"
                                label="良品 | Finished Goods"
                                name="optionGroup"
                                value="FinishedGoods"
                                checked={finalOption === 'FinishedGoods'}
                                onChange={(e) => setFinalOption(e.target.value)}
                                className="mb-2"
                            />
                            <Form.Check 
                                type="radio"
                                label="不良品 | NG (Not Good)"
                                name="optionGroup"
                                value="NG"
                                checked={finalOption === 'NG'}
                                onChange={(e) => setFinalOption(e.target.value)}
                                className="mb-2"
                            />
                            <Form.Check 
                                type="radio"
                                label="報廢品 | Scrap"
                                name="optionGroup"
                                value="Scrap"
                                checked={finalOption === 'Scrap'}
                                onChange={(e) => setFinalOption(e.target.value)}
                                className="mb-2"
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => {
                        setCheckQTY({ toFinish: false });
                        setFinalOption('');
                    }}>
                        取消 | Cancel
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={() => {
                            if (finalOption) {
                                console.log('選擇的選項:', finalOption);
                                handleFiveStepSubmit();
                            } else {
                                onShowMessage('error', '請先選擇一個選項 | Please select an option first');
                            }
                        }}
                        disabled={!finalOption}
                    >
                        送出 | Submit
                    </Button>
                </Modal.Footer>
            </Modal>
                
            ): null 
        }
            {
                finalData && Object.keys(finalData).length > 0 ? (
                    <>
                        <Table striped hover bordered className="cathode-table">
                            <tbody>
                                <tr>
                                    <td style={{ fontSize: "1.8rem", fontWeight: "600", letterSpacing: "0.2rem" }} colSpan={8}>
                                        <div style={{ display: "flex" , alignItems: "center" }}>
                                            <button style={{ display: "flex", alignItems: "center", justifyContent: "center", marginRight: "1rem" }} className="btn btn-primary" onClick={fetchData}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}> 
                                                    <div style={{marginRight : "10px"}}>下載資料 | Download data</div>
                                                </div>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-cloud-download" viewBox="0 0 16 16">
                                                    <path d="M4.406 1.342A5.53 5.53 0 0 1 8 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 0 1 0-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 0 0-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 0 1 0 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383"/>
                                                    <path d="M7.646 15.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 14.293V5.5a.5.5 0 0 0-1 0v8.793l-2.146-2.147a.5.5 0 0 0-.708.708z"/>
                                                </svg>
                                            </button>
                                        
                                        {MixingSelect === "正極混漿" ?
                                            <div>
                                                <div style={{ fontFamily: "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif" }}>{MixingSelect} | Cathode mixer operatort record page</div>
                                            </div> : null}
                                        </div>
                                        
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan={4}>
                                        <div>生產型態 (ProductionType) </div>
                                    </td>
                                    <td colSpan={4}>
                                        <div className="canBeChanged" onClick={handleBackEngineerSet}>{finalData.ProductionType}</div>
                                    </td>
                                </tr>
                                <tr>
                                    {finalData && (finalData.employeeName01 || finalData.employeeName02) ? (
                                        <>
                                            {finalData.employeeName01 && (
                                                <>
                                                    <td colSpan={2}>操作員資訊 |Operator Info(2F)</td>
                                                    <td colSpan={1}>
                                                        <div>
                                                            {finalData.employeeId01}
                                                        </div>
                                                    </td>
                                                    <td colSpan={1}>
                                                        <div>
                                                            {finalData.employeeName01}
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                            {finalData.employeeName02 && (
                                                <>
                                                    <td colSpan={2}>操作員資訊 |Operator Info(1F)</td>
                                                    <td colSpan={1}>
                                                        <div >
                                                            {finalData.employeeId02}
                                                        </div>
                                                    </td>
                                                    <td colSpan={1}>
                                                        <div >
                                                            {finalData.employeeName02}
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                        </>
                                    ) : null}
                                </tr>
                                <tr>
                                    <td colSpan={1}>LFP-1</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.LFP_1 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, LFP_1: e.target.value })} />
                                    </td>
                                    <td colSpan={1}>LFP-2</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.LFP_2 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, LFP_2: e.target.value })} />
                                    </td>
                                    <td colSpan={1}>Super P-1</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.SuperP_1 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, SuperP_1: e.target.value })} />
                                    </td>
                                    <td colSpan={1} style={{textWrap: "noWrap"}}>Super P-2</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.SuperP_2 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, SuperP_2: e.target.value })} />
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan={1}>PVDF-1</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.PVDF_1 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, PVDF_1: e.target.value })} />
                                    </td>
                                    <td colSpan={1}>PVDF-2</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.PVDF_2 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, PVDF_2: e.target.value })} />
                                    </td>
                                    <td colSpan={1}>CNT-1</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.CNT_1 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, CNT_1: e.target.value })} />
                                    </td>
                                    <td colSpan={1}>CNT-2</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.CNT_2 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, CNT_2: e.target.value })} />
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan={1}>NMP-1</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.NMP_1 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, NMP_1: e.target.value })} />
                                    </td>
                                    <td colSpan={1}>NMP-2</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.NMP_2 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, NMP_2: e.target.value })} />
                                    </td>
                                    <td colSpan={1}>CNT-3</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.CNT_3 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, CNT_3: e.target.value })} />
                                    </td>
                                    <td colSpan={1}>CNT-4</td>
                                    <td colSpan={1}>
                                        <input
                                            type="text"
                                            value={cathodeInner.CNT_4 || ""}
                                            onChange={e => setCathodeInner({ ...cathodeInner, CNT_4: e.target.value })} />
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan={2}>
                                            <div>混漿設備編號</div>
                                            <div style={{textWrap: "nowrap" }}>(Mixing Device number)</div>
                                        </td>
                                        <td colSpan={2}>
                                            <select style={{ width: "100%", height: "2rem", textAlign: "center" , border: "2px solid #000000" , fontWeight: "600" }}
                                                onChange={(e) => setSelectedMixingDevice(e.target.value)}
                                            >
                                                <option>choose device</option>
                                                {finalData && finalData.deviceNo_Mixing && finalData.deviceNo_Mixing.trim() !== ""
                                                ? finalData.deviceNo_Mixing.split(",").map((device, index) => {
                                                    const trimmedDevice = device.trim();
                                                    if (trimmedDevice !== "") { 
                                                    return (
                                                        <option key={index} value={trimmedDevice} style={{ textAlign: "center" , fontWeight: "600"}}>
                                                        {trimmedDevice}
                                                        </option>
                                                    );
                                                    } else {
                                                    return null;
                                                    }
                                                })
                                                : <option value="">無設備編號 (No device can be selected)</option>}
                                            </select>
                                        </td>
                                        <td colSpan={2}>
                                            <div>暫存桶設備編號</div>
                                            <div style={{textWrap: "nowrap" }}>(surgeTank Device number)</div>
                                        </td>
                                        <td colSpan={2}>
                                            <select style={{ width: "100%", height: "2rem", textAlign: "center" , border: "2px solid #000000" , fontWeight: "600" }}
                                                onChange={(e) => setSelectedSurgeTankDevice(e.target.value)}
                                            >
                                                <option>choose device</option>
                                                {finalData && finalData.deviceNo_surgeTank && finalData.deviceNo_surgeTank.trim() !== ""
                                                ? finalData.deviceNo_surgeTank.split(",").map((device, index) => {
                                                    const trimmedDevice = device.trim();
                                                    if (trimmedDevice !== "") { 
                                                    return (
                                                        <option key={index} value={trimmedDevice} style={{ textAlign: "center" , fontWeight: "600"}}>
                                                        {trimmedDevice}
                                                        </option>
                                                    );
                                                    } else {
                                                    return null;
                                                    }
                                                })
                                                : <option value="">無設備編號 (No device can be selected)</option>}
                                            </select>
                                        </td>
                                </tr>
                                <tr>
                                    <td colSpan={1}>NMP-1 Loading Weight</td>
                                    <td colSpan={1}>
                                        <div className="canBeChanged" onClick={handleBackEngineerSet}>{finalData.NMP_1_Loading_Weight}</div>
                                    </td>
                                    <td colSpan={1}>NMP-2 Loading Weight</td>
                                    <td colSpan={1}>
                                        <div className="canBeChanged" onClick={handleBackEngineerSet}>{finalData.NMP_2_Loading_Weight}</div>
                                    </td>
                                    <td colSpan={1}>CNT-1 Loading Weight</td>
                                    <td>
                                        <div className="canBeChanged" onClick={handleBackEngineerSet}>{finalData.CNT_1_Loading_Weight}</div>
                                    </td>
                                    <td colSpan={1}>NMP-3</td>
                                    <td colSpan={1}>
                                        <div className="canBeChanged" onClick={handleBackEngineerSet}>{finalData.NMP_3}</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan={1}>List no.</td>
                                    <td colSpan={1}>
                                        <div className="canBeChanged" onClick={handleSettingListNo}>{finalData.ListNo}</div>
                                    </td>
                                    <td colSpan={1}>
                                        <div>濾心目數</div>
                                        <div style={{ textWrap: "nowrap" }}>(Filter Mesh)</div>
                                    </td>
                                    <td colSpan={1}>
                                        <div className="canBeChanged" onClick={handleBackEngineerSet}>{finalData.Filter_Mesh}</div>
                                    </td>

                                    <td colSpan={1}>
                                        <div style={{ textWrap: "nowrap" }}>配方編號</div>
                                        <div style={{ textWrap: "nowrap" }}>(Slurry Recipe)</div>
                                    </td>
                                    <td colSpan={1}>
                                        <div className="canBeChanged" onClick={handleBackEngineerSet}>{finalData.ReceipeNo}</div>
                                    </td>

                                    <td colSpan={1} style={{ textWrap: "nowrap" }}>
                                        <div>配方</div>
                                    </td>
                                    <td colSpan={1}>
                                        {/* Recipe 依據混漿設備編號跳轉，若為混漿設備編號[0]則同步選定Receipe第[0]項 */}
                                        <div className="canBeChanged" onClick={handleBackEngineerSet}>
                                            {selectReceipe || "無配方"}
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan={2}>Date</td>
                                    <td colSpan={2}>
                                        <div>{currentTime}</div>
                                    </td>
                                    <td colSpan={2}>批次時間(batch time [min])</td>
                                    <td colSpan={2}>
                                        <div className="canBeChanged" onClick={handleBackEngineerSet}>{finalData.batch_time_min_Smaller}</div>
                                    </td>
                                </tr>
                            </tbody>
                        </Table>
                        <div className='buttonContainer' style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                                
                                <Button variant='success' onClick={(e) => handleSubmit(e, "1")}>
                                    <div>1.輸入配方編號與啟動時間</div>
                                    <div>(Load lot No and Start time)</div>
                                </Button>
                                <Button variant='success' onClick={handleBack}>
                                    <div>回到上一步 </div>
                                    <div>(Back to upper setting)</div>
                                </Button>
                            
                            </div>
                            <Button onClick={(e) => handleSubmit(e, "2")}> {/* 添加 onClick 處理 Step 2 */}
                                <div>2.混漿結束時間</div>
                                <div>(Batch end time)</div>
                            </Button>
                            <Button variant='warning' onClick={(e) => handleSubmit(e, "3")}>
                                <div>3.輸送起始時間</div>
                                <div>(Transport start time)</div>
                            </Button>
                            <Button variant='info' onClick={(e) => handleSubmit(e, "4")}>
                                <div>4.輸送結束時間</div>
                                <div>(Transport end time)</div>
                            </Button>
                            <Button variant='dark' onClick={(e) => handleSubmit(e, "5")}>
                                <div>5. 儲存資料</div>
                                <div>(Save data)</div>
                            </Button>
                            <Button variant='danger' onClick={(e) => handleSubmit(e, "6")}>
                                <div>6. 刪除資料</div>
                                <div>(Delete data)</div>
                            </Button>
                            <Button style={{ backgroundColor: "#001aff" , border: "none" }} onClick={(e) => handleSubmit(e, "7")}>
                                <div>7. 大清潔</div>
                                <div>(clean List No)</div>
                            </Button>

                        </div>
                        <div className='finallDisplay' style={{ overflow: "scroll"}}>
                            {/* Sticky Scroll Table for Cathode */}
                            <StickyScrollTable_Cathode
                                belowData={belowData}
                                selectReturnStatus={selectReturnStatus}
                                setReturnStatus={setReturnStatus}
                                setCheckBoxStatus={setCheckBoxStatus}
                                setBelowData={setBelowData}
                                finalData={finalData}
                                collectWarningData={collectWarningData}
                            />
                        </div>
                        {
                            openDeleteModal && (
                                <>
                                    <DeleteModal
                                        show={openDeleteModal}
                                        onHide={() => setOpenDeleteModal(false)}
                                        onDeleteConfirm={handleSixStep}
                                    />
                                </>
                            )
                        }
                        
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

export default Cathode;