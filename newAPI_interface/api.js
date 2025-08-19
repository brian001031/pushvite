import axios from "axios";
import config from "../../config";
import { toast } from "react-toastify";
import moment from "moment";

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
    equipmentID,
    shiftclass,
    machineoption,
    accmount_stdate
  ) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/coatingAnode/groupname_capacitynum`,
        //`http://localhost:3009/coatingAnode/groupname_capacitynum`,
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
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
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
    equipmentID,
    shiftclass,
    machineoption,
    accmount_stdate
  ) => {
    try {
      const response = await axios.get(
        `${config.apiBaseUrl}/mixingAnode/groupname_capacitynum`,
        // `http://localhost:3009/mixingAnode/groupname_capacitynum`,
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
        "Error fetching Mixcathanode group name and capacity number:",
        error
      );
      // toast.error('Error fetching Mixcathanode group name and capacity number');
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
        // `http://localhost:3009/cuttingAnode/fullmachinecapacity`,
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
        //  `http://localhost:3009/stacking/updatepage`,
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
        // `http://localhost:3009/stacking/groupname_capacitynum`,
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
        // `http://localhost:3009/stacking/fullmachinecapacity`,
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
};

export default api;
