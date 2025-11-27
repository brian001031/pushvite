import axios from "axios";
import config from "../../config";
import { toast } from "react-toastify";
import moment from "moment";
import gsap from "gsap";

const api = {
  // 所有站用的設定值
  callGet_referenceItem: async (varName) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/equipmentonly/data/${varName}`,
        // `http://localhost:3009/equipmentonly/data/${varName}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("EdgeFolding_referenceItem_Fatching Error :", error);
      // toast.error('Error fetching EdgeFolding reference item');
    }
  },
  callPost_referenceItem: async (varName, dataReference) => {
    try {
      const response = await axios.post(
        `${config.apiBaseUrl}/equipmentonly/data/update-data/${varName}`,
        // `http://localhost:3009/equipmentonly/data/update-data/${varName}`,
        dataReference
      );
      return response.data;
    } catch (error) {
      console.error("EdgeFolding_referenceItem_Fatching Error :", error);
      // toast.error('Error fetching EdgeFolding reference item');
    }
  },

  // 精封站API :
  callEdgeFolding: async (machineoption) => {
    try {
      const response = await axios.get(
        // `http://localhost:3009/edgefold/updatepage`,
        `${config.apiBaseUrl}/edgefold/updatepage`,
        {
          params: {
            machineoption: machineoption,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("EdgeFolding_updatepage_Fatching Error :", error);
      // toast.error('Error fetching EdgeFolding data');
    }
  },

  callEdgeFolding_groupname_capacitynum: async (
    equipmentID,
    shiftclass,
    machineoption,
    accmount_stdate
  ) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/edgefold/groupname_capacitynum`,
        // `http://localhost:3009/edgefold/groupname_capacitynum`,
        {
          params: {
            equipmentID: equipmentID,
            shiftclass: shiftclass,
            machineoption: machineoption,
            accmount_stdate: accmount_stdate,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching EdgeFolding group name and capacity number:",
        error
      );
      // toast.error('Error fetching EdgeFolding group name and capacity number');
    }
  },
  callEdgeFolding_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        // `http://localhost:3009/edgefold/fullmachinecapacity`,
        `${config.apiBaseUrl}/edgefold/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "callCuttingCathode_todayfullmachinecapacity Error :",
        error
      );
      // toast.error('Error fetching Cutting data');
    }
  },

  // 正/負極塗佈站 API :
  callCoating_cathanode: async (machineoption) => {
    try {
      const response = await axios.get(
        // `http://localhost:3009/coatingAnode/updatepage`,
        `${config.apiBaseUrl}/coatingAnode/updatepage`,
        {
          params: {
            machineoption: machineoption,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Mixcathanode_updatepage_Fatching Error :", error);
      // toast.error('Error fetching Mixcathanode data');
    }
  },

  callCoating_cathanode_groupname_capacitynum: async (
    machineoption,
    startDate
  ) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/coatingAnode/groupname_capacitynum`,
        // `http://localhost:3009/coatingAnode/groupname_capacitynum`,
        {
          params: {
            machineoption: machineoption,
            startDate: startDate,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
    }
  },

  callCoating_cathode_todayfullmachinecapacity : async () =>{
    const currentDay = moment(new Date()).format("YYYY-MM-DD");
    
    try{
      const response = await axios.get(
        `${config.apiBaseUrl}/coatingAnode/fullmachinecapacity_cathode`,
        // `http://localhost:3009/coatingAnode/fullmachinecapacity_cathode`,
        {
          params: {
            currentDay: currentDay,
          },
        }
      )

      return response.data || {}

    }catch(error){
      console.log ("callMixing_cathanode_todayfullmachinecapacity Error :", error)
      throw error
    }
  },
    callCoating_anode_todayfullmachinecapacity : async () =>{
    const currentDay = moment(new Date()).format("YYYY-MM-DD");
    
    try{
      const response = await axios.get(
        `${config.apiBaseUrl}/coatingAnode/fullmachinecapacity_anode`,
        // `http://localhost:3009/coatingAnode/fullmachinecapacity_anode`,
        {
          params: {
            currentDay: currentDay,
          },
        }
      )

      return response.data || {}

    }catch(error){
      console.log ("callMixing_cathanode_todayfullmachinecapacity Error :", error)
      throw error
    }
  },

  // 正負極混漿站 API :
  // 正/負極塗佈站 API :
  callMixing_cathanode: async (machineoption) => {
    try {
      const response = await axios.get(
        // `http://localhost:3009/mixingAnode/updatepage`,
        `${config.apiBaseUrl}/mixingAnode/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Mixcathanode_updatepage_Fatching Error :", error);
      // toast.error('Error fetching Mixcathanode data');
    }
  },

  callMixing_cathanode_groupname_capacitynum: async (
    machineoption,
    startDate
  ) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/mixingAnode/groupname_capacitynum`,
        // `http://localhost:3009/mixingAnode/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            accmount_stdate: startDate,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
    }
  },
  // 正極混漿站 抓 total api 
  callMixing_cathanode_todayfullmachinecapacity: async () => {

    const currentDay = moment(new Date()).format("YYYY-MM-DD");
    
    try{
      const response = await axios.get(
        `${config.apiBaseUrl}/mixingAnode/fullmachinecapacity_cathode`,
        // `http://localhost:3009/mixingAnode/fullmachinecapacity_cathode`,
        {
          params: {
            currentDay: currentDay,
          },
        }
      )

      return response.data || {}

    }catch(error){
      console.log ("callMixing_cathanode_todayfullmachinecapacity Error :", error)
      throw error
    }
  },
  callMixing_anode_todayfullmachinecapacity: async () => {

    const currentDay = moment(new Date()).format("YYYY-MM-DD");
    
    try{
      const response = await axios.get(
        `${config.apiBaseUrl}/mixingAnode/fullmachinecapacity_anode`,
        // `http://localhost:3009/mixingAnode/fullmachinecapacity_anode`,
        {
          params: {
            currentDay: currentDay,
          },
        }
      )

      return response.data || {}

    }catch(error){
      console.log ("callMixing_anode_todayfullmachinecapacity Error :", error)
      throw error
    }
  },

  // 正負極混漿站 API :
  // 正/負極塗佈站 API :
  callAssembly: async (machineoption) => {
    try {
      const response = await axios.get(
        //`http://localhost:3009/assembly/updatepage`,
        `${config.apiBaseUrl}/assembly/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Mixcathanode_updatepage_Fatching Error :", error);
      // toast.error('Error fetching Mixcathanode data');
    }
  },

  callAssembly_groupname_capacitynum: async (machineoption, endDay) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/assembly/groupname_capacitynum`,
        //`http://localhost:3009/assembly/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            endDay: endDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
    }
  },

  callAssembly_todayfullmachinecapacity: async (currentDay) => {
    try {
      const response = await axios.get(
        //`http://localhost:3009/assembly/fullmachinecapacity`,
        `${config.apiBaseUrl}/assembly/fullmachinecapacity`,

        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callAssembly_todayfullmachinecapacity Error :", error);
      // toast.error('Error fetching assembly data');
    }
  },

  // 大小烘箱 API :
  callOven: async (machineoption) => {
    try {
      const response = await axios.get(
        // `http://localhost:3009/oven/updatepage`,
        `${config.apiBaseUrl}/oven/updatepage`,
        {
          params: {
            machineoption: machineoption,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("EdgeFolding_updatepage_Fatching Error :", error);
      // toast.error('Error fetching EdgeFolding data');
    }
  },

  // 大小烘箱 API 計算入出量:
  callOven_groupname_capacitynum: async (
    equipmentID,
    shiftclass,
    machineoption,
    accmount_stdate
  ) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/oven/groupname_capacitynum`,
        //`http://localhost:3009/oven/groupname_capacitynum`,
        {
          params: {
            equipmentID: equipmentID,
            shiftclass: shiftclass,
            machineoption: machineoption,
            accmount_stdate: accmount_stdate,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching EdgeFolding group name and capacity number:",
        error
      );
      // toast.error('Error fetching EdgeFolding group name and capacity number');
    }
  },

  //
  callOven_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        //`http://localhost:3009/oven/fullmachinecapacity`,
        `${config.apiBaseUrl}/oven/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callOven_todayfullmachinecapacity Error :", error);
    }
  },

  // 正極模切資料
  callCuttingCathode: async (machineoption) => {
    try {
      const response = await axios.get(
        //  `http://localhost:3009/cuttingCathod/updatepage`,
        `${config.apiBaseUrl}/cuttingCathod/updatepage`,
        {
          params: {
            machineoption: machineoption,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Cutting_updatepage_Fatching Error :", error);
      // toast.error('Error fetching Cutting data');
    }
  },

  callCuttingCathode_groupname_capacitynum: async (machineoption, endDay) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/cuttingCathod/groupname_capacitynum`,
        // `http://localhost:3009/cuttingCathod/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            endDay: endDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
    }
  },

  callCuttingCathode_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        // `http://localhost:3009/cuttingCathod/fullmachinecapacity`,
        `${config.apiBaseUrl}/cuttingCathod/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "callCuttingCathode_todayfullmachinecapacity Error :",
        error
      );
      // toast.error('Error fetching Cutting data');
    }
  },

  // 負極模切資料
  callCuttingAnode: async (machineoption) => {
    try {
      const response = await axios.get(
        //  `http://localhost:3009/cuttingAnode/updatepage`,
        `${config.apiBaseUrl}/cuttingAnode/updatepage`,
        {
          params: {
            machineoption: machineoption,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Cutting_updatepage_Fatching Error :", error);
      // toast.error('Error fetching Cutting data');
    }
  },

  callCuttingAnode_groupname_capacitynum: async (machineoption, endDay) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/cuttingAnode/groupname_capacitynum`,
        // `http://localhost:3009/cuttingAnode/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            endDay: endDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
    }
  },
  callCuttingAnode_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        //  `http://localhost:3009/cuttingAnode/fullmachinecapacity`,
        `${config.apiBaseUrl}/cuttingAnode/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "callCuttingCathode_todayfullmachinecapacity Error :",
        error
      );
      // toast.error('Error fetching Cutting data');
    }
  },

  //疊片站(1~2休機先暫時不顯示 , 3~5 一期 , 6~9 new-1 二期 )
  callStacking: async (machineoption) => {
    try {
      const response = await axios.get(
        //`http://localhost:3009/stacking/updatepage`,
        `${config.apiBaseUrl}/stacking/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Mixcathanode_updatepage_Fatching Error :", error);
      // toast.error('Error fetching Mixcathanode data');
    }
  },

  callStacking_groupname_capacitynum: async (machineoption, endDay) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/stacking/groupname_capacitynum`,
        //`http://localhost:3009/stacking/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            endDay: endDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
    }
  },

  callStacking_todayfullmachinecapacity: async (currentDay) => {
    try {
      const response = await axios.get(
        //`http://localhost:3009/stacking/fullmachinecapacity`,
        `${config.apiBaseUrl}/stacking/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callStacking_todayfullmachinecapacity Error :", error);
      // toast.error('Error fetching Mixcathanode data');
    }
  },

  // 注液機資料
  callinjection: async (machineoption) => {
    try {
      const response = await axios.get(
        //  `http://localhost:3009/injection/updatepage`,
        `${config.apiBaseUrl}/injection/updatepage`,
        {
          params: {
            machineoption: machineoption,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Cutting_updatepage_Fatching Error :", error);
      // toast.error('Error fetching Cutting data');
    }
  },

  callinjection_groupname_capacitynum: async (machineoption, endDay) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/injection/groupname_capacitynum`,
        // `http://localhost:3009/injection/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            endDay: endDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
    }
  },
  callinjection_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        // `http://localhost:3009/injection/fullmachinecapacity`,
        `${config.apiBaseUrl}/injection/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "callCuttingCathode_todayfullmachinecapacity Error :",
        error
      );
      // toast.error('Error fetching Cutting data');
    }
  },

  //R.T. Aging(常溫倉靜置)
  callRTAging: async (machineoption) => {
    try {
      const response = await axios.get(
        // `http://localhost:3009/rt_aging/updatepage`,
        `${config.apiBaseUrl}/rt_aging/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("RTAging_updatepage_Fatching Error :", error);
    }
  },

  callRTAging_groupname_capacitynum: async (machineoption, endDay, memeID) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/rt_aging/groupname_capacitynum`,
        // `http://localhost:3009/rt_aging/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            endDay: endDay,
            memeID: memeID,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching RTAging group name and capacity number:",
        error
      );
      // toast.error('Error fetching RTAging group name and capacity number');
    }
  },

  callRTAging_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        // `http://localhost:3009/rt_aging/fullmachinecapacity`,
        `${config.apiBaseUrl}/rt_aging/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callRTAging_todayfullmachinecapacity Error :", error);
    }
  },

  // 分選盼別站 GET 設備資訊 :
  callSulting: async (machineoption) => {
    try {
      const response = await axios.get(
        // `http://localhost:3009/sulting/updatepage`,
        `${config.apiBaseUrl}/sulting/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Mixcathanode_updatepage_Fatching Error :", error);
      // toast.error('Error fetching Mixcathanode data');
    }
  },

  callSulting_groupname_capacitynum: async (
    equipmentID,
    shiftclass,
    machineoption,
    accmount_stdate
  ) => {
    try {
      const response = await axios.get(
        // `http://localhost:3009/sulting/groupname_capacitynum`,
        `${config.apiBaseUrl}/sulting/groupname_capacitynum`,
        {
          params: {
            equipmentID: equipmentID,
            shiftclass: shiftclass,
            machineoption: String(machineoption).trim(),
            accmount_stdate: accmount_stdate,
          },

          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
    }
  },

  callSulting_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");
    try {
      const response = await axios.get(
        // `http://localhost:3009/sulting/fullmachinecapacity`,
        `${config.apiBaseUrl}/sulting/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callSulting_todayfullmachinecapacity Error :", error);
    }
  },

  // 分選盼別站異常資訊 :
  callSulting_Abnormality_errorinfo: async (
    select_error,
    runlogDate,
    sideoption
  ) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/sulting/ng_record_content`,
        //`http://localhost:3009/sulting/ng_record_content`,
        {
          params: {
            errorstatus: encodeURIComponent(
              Array.isArray(select_error)
                ? select_error.join("/")
                : select_error || "All全部"
            ),
            runlogDate: runlogDate,
            sideoption: sideoption,
          },
        }
      );
      console.log(
        "callSulting_Abnormality_errorinfo response :",
        response.data
      );
      return response.data;
    } catch (error) {
      console.error("callSulting_Unusual_errorinfo Error :", error);
    }
  },

  // 化成站設定
  callchemosynthesis: async (machineOption) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/chemosynthesis/updatepage`,
        //`http://localhost:3009/chemosynthesis/updatepage`,
        {
          params: {
            machineOption: String(machineOption).trim(),
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("callchemosynthesis Error :", error);
    }
  },

  callchemosynthesis_groupname_capacitynum: async (
    machineoption,
    startDate,
    member_ID
  ) => {
    let startDay = moment(new Date(startDate))
      .locale("zh-tw")
      .format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/chemosynthesis/groupname_capacitynum`,
        // `http://localhost:3009/chemosynthesis/groupname_capacitynum`,
        {
          params: {
            machineOption: String(machineoption).trim(),
            startscanDay: startDay,
            member_ID: member_ID,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callchemosynthesis_groupname_capacitynum Error :", error);
      throw error;
    }
  },

  callchemosynthesis_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/chemosynthesis/fullmachinecapacity`,
        //`http://localhost:3009/chemosynthesis/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "callchemosynthesis_todayfullmachinecapacity Error :",
        error
      );
      throw error;
    }
  },

  // 分容站設定
  callcapacity: async (machineoption) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/capacity/updatepage`,
        // `http://localhost:3009/capacity/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callcapacity Error :", error);
    }
  },

  callcapacity_groupname_capacitynum: async (machineoption, startDate) => {
    let startDay = moment(new Date(startDate))
      .locale("zh-tw")
      .format("YYYY-MM-DD");
    let endDay = moment(new Date()).locale("zh-tw").format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/capacity/groupname_capacitynum`,
        // `http://localhost:3009/capacity/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            startDay: startDay,
            endDay: endDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callcapacity_groupname_capacitynum Error :", error);
      throw error;
    }
  },

  callCapacity_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        // `${config.apiBaseUrl}/capacity/fullmachinecapacity`,
        `http://localhost:3009/capacity/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callcapacity_todayfullmachinecapacity Error :", error);
      throw error;
    }
  },

  callht_aging: async (machineoption) => {
    const endDay = moment(new Date()).locale("zh-tw").format("YYYY-MM-DD");
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/ht_aging/updatepage`,
        // `http://localhost:3009/ht_aging/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            endDay: endDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("ht_aging Error :", error);
      throw error;
    }
  },

  callht_aging_groupname_capacitynum: async (machineoption, startDate) => {
    const endDate = moment(new Date()).locale("zh-tw").format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/ht_aging/groupname_capacitynum`,
        // `http://localhost:3009/ht_aging/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            startDay: startDate,
            endDay: endDate,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("ht_aging Error :", error);
      throw error;
    }

    console.log("had cal callht_aging_groupname_capacitynum");
  },

  callht_aging_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

      try{
        const response = await axios.get(
          `${config.apiBaseUrl}/ht_aging/fullmachinecapacity`,
          // `http://localhost:3009/ht_aging/fullmachinecapacity`,
          {
            params: {
              currentDay: currentDay,
            },
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        return response.data;
    }catch (error) {
      console.error("callcapacity_todayfullmachinecapacity Error :", error);
      throw error;
    }

    console.log("had cal callht_aging_todayfullmachinecapacity");
  },

  // degassing

  calldegassing: async (machineoption) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/degassing/updatepage`,
        // `http://localhost:3009/degassing/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("calldegassing Error :", error);
      throw error;
    }
  },

  calldegassing_groupname_capacitynum: async (machineoption, startDate) => {
    const endDate = moment(new Date()).locale("zh-tw").format("YYYY-MM-DD");
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/degassing/groupname_capacitynum`,
        // `http://localhost:3009/degassing/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            startDay: startDate,
            endDay: endDate,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("ht_aging Error :", error);
      throw error;
    }
  },

  callDegassing_todayfullmachinecapacity: async () =>{
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try{
      const response = await axios.get(
        `${config.apiBaseUrl}/degassing/fullmachinecapacity`,
        // `http://localhost:3009/degassing/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    }catch (error){
      console.error("callcapacity_todayfullmachinecapacity Error :", error);
      return error;
    }
  },

  callslittingCathode: async (machineoption) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/slittingCathode/updatepage`,
        // `http://localhost:3009/slittingCathode/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("calldegassing Error :", error);
      throw error;
    }
  },

  callslittingCathode_groupname_capacitynum: async (
    machineoption,
    startDate
  ) => {
    const endDate = moment(new Date()).locale("zh-tw").format("YYYY-MM-DD");
    const startDay = moment(new Date(startDate))
      .locale("zh-tw")
      .format("YYYY-MM-DD");

      console.log("startDay:", startDay);
      console.log("endDate:", endDate);
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/slittingCathode/groupname_capacitynum`,
        // `http://localhost:3009/slittingCathode/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            startDay: startDay,
            endDay: endDate,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("slittingCathode Error :", error);
      throw error;
    }
  },

  callSlitting_cathode_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/slittingCathode/fullmachinecapacity`,
        // `http://localhost:3009/slittingCathode/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callcapacity_todayfullmachinecapacity Error :", error);
      throw error;
    }
  },

  

  callslittingAnode: async (machineoption) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/slittingAnode/updatepage`,
        // `http://localhost:3009/slittingAnode/updatepage`,
        {
          params: {
            machineoption: String(machineoption).trim(),
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("calldegassing Error :", error);
      throw error;
    }
  },

  callslittingAnode_groupname_capacitynum: async (machineoption, startDate) => {
      const endDate = moment(new Date()).locale("zh-tw").format("YYYY-MM-DD");
      const startDay = moment(startDate).locale("zh-tw").format("YYYY-MM-DD");
      
      // console.log("callslittingAnode_groupname_capacitynum - startDay:", startDay);
      // console.log("callslittingAnode_groupname_capacitynum - endDay:", endDate);
      
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/slittingAnode/groupname_capacitynum`,
        // `http://localhost:3009/slittingAnode/groupname_capacitynum`,
        {
          params: {
            machineoption: String(machineoption).trim(),
            startDay: startDay,
            endDay: endDate,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("slittingCathode Error :", error);
      throw error;
    }
  },

  callSlitting_anode_todayfullmachinecapacity: async () => {
    let currentDay = moment(new Date()).format("YYYY-MM-DD");

    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/slittingAnode/fullmachinecapacity`,
        // `http://localhost:3009/slittingAnode/fullmachinecapacity`,
        {
          params: {
            currentDay: currentDay,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("callcapacity_todayfullmachinecapacity Error :", error);
      throw error;
    }
  },
};

export default api;
