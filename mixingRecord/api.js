import axios from 'axios';
import config from '../../config';



const api = {
    //登入
    callgetMixprocess_Login: async (
            engineer_id, 
            engineer_name, 
            password, 
            mix_select_side,
    ) => {
        try {
        const response = await axios.get(
            `${config.apiBaseUrl}/mixprocess/Login`,
            // `http://localhost:3009/mixprocess/Login`,
            {
                params: {
                    engineer_id,
                    engineer_name,
                    password,
                    mix_select_side,
                },
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
        return response;
        } catch (error) {
        console.error('Error fetching events:', error);
        return null;
        }
    },
    // 註冊
    callpostMixproccess_Register: async (
    engineer_id,
    engineer_name,
    password
    ) => {
        try {
            const response = await axios.post(
                `${config.apiBaseUrl}/mixprocess/Register`,
                // `http://localhost:3009/mixprocess/Register`,
                {
                    engineer_id,
                    engineer_name,
                    password,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            return response; // 返回完整的 response 对象
        } catch (error) {
            console.error('Error fetching events:', error);
            return error.response; // 返回 error.response
        }
    },
    
    // 獲取工程師useForm 資料 
    callset_engineerDataSet: async (
        Submittime,
        EngineerName,
        EngineerNo,
        Password,
        ProductionType,
        MixingSelect,
        ReceipeNo,
        deviceNo_Mixing,
        deviceNo_surgeTank,
        Recipe,
        Filter_Mesh,
        batch_time_min_Smaller,
        batch_time_min_Bigger,
        Water_1_LoadingWeight,
        Water_2_LoadingWeight,
        Water_3_LoadingWeight,
        NMP,
        NMP_1_Loading_Weight,
        NMP_2_Loading_Weight,
        CNT_1_Loading_Weight,
        NMP_3,
        loadingTankNo,
        ListNo,

        Nvalue_Engineer_S,
        Nvalue_Engineer_E,
        SolidContent_Engineer_S,
        SolidContent_Engineer_E,
        Viscosity_Engineer_S,
        Viscosity_Engineer_E,
        ParticalSize_Engineer_S,
        ParticalSize_Engineer_E
        // comment set 
        
    ) =>{
        try{
            const response = await axios.put(
                `${config.apiBaseUrl}/mixprocess/set_engineerDataSet`,
                // `http://localhost:3009/mixprocess/set_engineerDataSet`,
                {
                    Submittime,
                    EngineerName,
                    EngineerNo,
                    Password,
                    ProductionType,
                    MixingSelect,
                    ReceipeNo,
                    deviceNo_Mixing,
                    deviceNo_surgeTank,
                    Recipe,
                    Filter_Mesh,
                    batch_time_min_Smaller,
                    batch_time_min_Bigger,
                    Water_1_LoadingWeight,
                    Water_2_LoadingWeight,
                    Water_3_LoadingWeight,
                    NMP,
                    NMP_1_Loading_Weight,
                    NMP_2_Loading_Weight,
                    CNT_1_Loading_Weight,
                    NMP_3,
                    loadingTankNo,
                    ListNo,

                    // comment set
                    Nvalue_Engineer_S,
                    Nvalue_Engineer_E,
                    SolidContent_Engineer_S,
                    SolidContent_Engineer_E,
                    Viscosity_Engineer_S,
                    Viscosity_Engineer_E,
                    ParticalSize_Engineer_S,
                    ParticalSize_Engineer_E
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            )
            return response;
        } catch (error) {
            console.error('Error fetching events:', error);
            return error.response; // 返回 error.response
        }
    }, 
    // 依OP 工號找 Name 
    callgetEngineerName: async (engineer_id, onShowMessage = null) => {
        try {

            
            const response = await axios.get(
                `${config.apiBaseUrl}/mixprocess/getEngineerName`,
                // `http://localhost:3009/mixprocess/getEngineerName`,
                {   
                    params: { 
                        employeeNo: String(engineer_id).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
                    },
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response;
        } catch (error) {

             if (error.response.status === 404) {
                const errorMessage = "查無此人員工號，請確認輸入是否正確。";
                if (onShowMessage) {
                    onShowMessage('error', errorMessage);
                } else {
                    console.error(errorMessage);
                }
            }
            console.error('Error fetching engineer name:', error);
            return null;
        }
    },
    
    // 主畫面Post 請求 
    call_Post_mixingInfo_inner_post: async (
        innerSend
    ) => {
        try{
            const response = await axios.post(
                `${config.apiBaseUrl}/mixprocess/mixingInfo_inner_post`,
                // `http://localhost:3009/mixprocess/mixingInfo_inner_post`,
                innerSend,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            return response;
            
        }catch (error) {
            console.error('Error fetching events:', error);
            return null;
        }
    },

    call_mixingInfo_inner_get: async (
        engineer_name,
        mix_select_side
    )=>{
        try {
            const response = await axios.get(
                `${config.apiBaseUrl}/mixprocess/mixingInfo_inner_get`,
                // `http://localhost:3009/mixprocess/mixingInfo_inner_get`,
                
                {   
                    params: { 
                        engineer_name,
                        mix_select_side
                    },
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
              
            );
            return response;
        } catch (error) {
            console.error('Error fetching mixing info:', error);
            return null;
        }
    },
    call_mixingInfo_CheckType: async (
        engineer_name,
        mix_select_side
    )=>{
        try {
            const response = await axios.get(
                `${config.apiBaseUrl}/mixprocess/mixingInfo_CheckType`,
                // `http://localhost:3009/mixprocess/mixingInfo_CheckType`,
                
                {   
                    params: { 
                        engineer_name,
                        mix_select_side
                    },
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
              
            );
            return response;
        } catch (error) {
            console.error('Error fetching mixing info:', error);
            return null;
        }
    },

    call_getEngineerSetting: async (
        engineer_id ,  
        MixingSelect
    ) => {
        try {
            const response = await axios.get(
                `${config.apiBaseUrl}/mixprocess/getEngineerSetting`,
                // `http://localhost:3009/mixprocess/getEngineerSetting`,
                {
                    params: { 
                        engineer_id ,  
                        MixingSelect
                    },
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            return response;
        } catch (error) {
            console.error('Error fetching engineer setting:', error);
            return null;
        }
    },

    call_postLotNoNotify_backend: async (
        selectMixing,
        newListNo,
        employeeId
    ) => {

        try{
            const response = await axios.post(
                `${config.apiBaseUrl}/mixprocess/lotNoNotify`,
                // `http://localhost:3009/mixprocess/lotNoNotify`,
                {
                    selectMixing,
                    newListNo,
                    employeeId
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            return response;
        }catch(error){
            console.log ("寄送誰變更了LotNo 失敗")
        }
    },

    //配方資訊提交
    call_mixing_prescription_backend: async (
        formData_final
    ) => {
        try{
            const response = await axios.post(
                `${config.apiBaseUrl}/mixprocess/prescription`,
                // `http://localhost:3009/mixprocess/prescription`,
                  formData_final
                ,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
            return response;
        }catch(error){
            console.log ("傳送混漿配方資訊失敗!")
        }
    },
    
    //找尋配方單號版本
    call_mixing_maincode_version: async (
        masterNo,
		mainform_first_str
    ) => {
        try{
            const response = await axios.post(
                `${config.apiBaseUrl}/mixprocess/findver_number`,
                // `http://localhost:3009/mixprocess/findver_number`,
                 {
				   masterNo,
				   mainform_first_str				 
				 }
				 ,
                 {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                 }
            );
            return response;
        }catch(error){
            console.log ("取得混漿配方單號版本號碼失敗!")
        }
    }

    
}

export default api;