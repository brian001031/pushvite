import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import '../style.scss'; 
import { Suspense } from 'react';
import { use } from 'react';
import api from '../api'
import moment from 'moment/moment';

function EngineerDetail({ show, onBackLogin ,centered ,login , selectMixing , handleDataAll }) {
  
  const [innerChange, setInnerChange] = useState(false); // 是否有變更角色
  const [deviceNo_Mixing , setDeviceNo_Mixing] = useState([]); // 設備編號
  const [deviceNo_surgeTank, setDeviceNo_surgeTank] = useState([]); // 暫存桶設備編號
  const  [loadingTankNo, setLoadingTankNo] = useState([]); // 下料桶槽編號
  const [receipe, setReceipe] = useState([]); // 配方編號

  const [switchBar , setSwitchBar] = useState(false); // 切換頁籤 

  const now = new Date();
  const Submittime = moment(now, 'yyyy-MM-dd HH:mm:ss').local('zh-TW');

  const [dataFormInner_Anode, setDataFormInner_Anode] = useState(
    {
      ProductionType: "",
      ReceipeNo: "",
      deviceNo_Mixing : "",
      deviceNo_surgeTank: "",
      Recipe: "",
      Filter_Mesh: "",
      batch_time_min_Smaller: "",
      batch_time_min_Bigger: "",
      Water_1_LoadingWeight: "",
      Water_2_LoadingWeight: "",
      Water_3_LoadingWeight: "",
      NMP: "",
      loadingTankNo: "",
      ListNo: "",
    }
  );
  const [dataFormInner_Cathode, setDataFormInner_Cathode] = useState({
    ProductionType: "",
    NMP_1_Loading_Weight: "",
    NMP_2_Loading_Weight: "",
    CNT_1_Loading_Weight: "",
    NMP_3: "",
    ReceipeNo: "",
    deviceNo_Mixing: "",
    deviceNo_surgeTank: "",
    Recipe: "",
    Filter_Mesh: "",
    batch_time_min_Smaller: "",
    batch_time_min_Bigger: "",
    loadingTankNo: "",
    ListNo: "",
  });

  const [commonSettings , setCommonSettings] = useState({
    Nvalue_Engineer_S: "",
    Nvalue_Engineer_E: "",
    Viscosity_Engineer_S: "",
    Viscosity_Engineer_E: "",
    ParticalSize_Engineer_S: "",
    ParticalSize_Engineer_E: "",
    SolidContent_Engineer_S: "",
    SolidContent_Engineer_E: ""
  });
  
  
  useEffect(() => {
  const fetchEngineerData = async () => {
    if (!login.engineerNo || !login.engineerName || !login.engineerPsw || !selectMixing) {
      return;
    }

    try {
      const response = await api.callgetMixprocess_Login(
        login.engineerNo,
        login.engineerName,
        login.engineerPsw,
        selectMixing
      );
      // console.log("工程師資料:", response.data.data);
      let dataToDo = response.data.data;

      console.log ("抓取工程師資料:", dataToDo);
      setLoadingTankNo(dataToDo.loadingTankNo ? dataToDo.loadingTankNo.split(",") : [""]);
      setDeviceNo_Mixing(dataToDo.deviceNo_Mixing ? dataToDo.deviceNo_Mixing.split(",") : [""]);
      setDeviceNo_surgeTank(dataToDo.deviceNo_surgeTank ? dataToDo.deviceNo_surgeTank.split(",") : [""]);
      setReceipe(dataToDo.Recipe ? dataToDo.Recipe.split(",") : [""]);

      if (selectMixing === "正極混漿") {
        setDataFormInner_Cathode({
          ProductionType: dataToDo.ProductionType || "",
          NMP_1_Loading_Weight: dataToDo.NMP_1_Loading_Weight || "",
          NMP_2_Loading_Weight: dataToDo.NMP_2_Loading_Weight || "",
          CNT_1_Loading_Weight: dataToDo.CNT_1_Loading_Weight || "",
          NMP_3: dataToDo.NMP_3 || "",
          ReceipeNo: dataToDo.ReceipeNo || "",
          deviceNo_Mixing: dataToDo.deviceNo_Mixing || "",
          deviceNo_surgeTank: dataToDo.deviceNo_surgeTank || "",
          Recipe: dataToDo.Recipe || "",
          Filter_Mesh: dataToDo.Filter_Mesh || "",
          batch_time_min_Smaller: dataToDo.batch_time_min_Smaller || "",
          batch_time_min_Bigger: dataToDo.batch_time_min_Bigger || "",
          loadingTankNo: dataToDo.loadingTankNo || "",
          ListNo: dataToDo.ListNo || "",
        });
      } else if (selectMixing === "負極混漿") {
        setDataFormInner_Anode({
          ProductionType: dataToDo.ProductionType || "",
          ReceipeNo: dataToDo.ReceipeNo || "",
          deviceNo_Mixing: dataToDo.deviceNo_Mixing || "",
          deviceNo_surgeTank: dataToDo.deviceNo_surgeTank || "",
          Recipe: dataToDo.Recipe || "",
          Filter_Mesh: dataToDo.Filter_Mesh || "",
          batch_time_min_Smaller: dataToDo.batch_time_min_Smaller || "",
          batch_time_min_Bigger: dataToDo.batch_time_min_Bigger || "",
          Water_1_LoadingWeight: dataToDo.Water_1_LoadingWeight || "",
          Water_2_LoadingWeight: dataToDo.Water_2_LoadingWeight || "",
          Water_3_LoadingWeight: dataToDo.Water_3_LoadingWeight || "",
          NMP: dataToDo.NMP || "",
          loadingTankNo: dataToDo.loadingTankNo || "",
          ListNo: dataToDo.ListNo || "",
        });

        console.log("dataToDo.ListNo   :" , dataToDo.ListNo)
      }
      setCommonSettings({
          Nvalue_Engineer_S: dataToDo.Nvalue_Engineer_S || "",
          Nvalue_Engineer_E: dataToDo.Nvalue_Engineer_E || "",
          Viscosity_Engineer_S: dataToDo.Viscosity_Engineer_S || "",
          Viscosity_Engineer_E: dataToDo.Viscosity_Engineer_E || "",
          ParticalSize_Engineer_S: dataToDo.ParticalSize_Engineer_S || "",
          ParticalSize_Engineer_E: dataToDo.ParticalSize_Engineer_E || "",
          SolidContent_Engineer_S: dataToDo.SolidContent_Engineer_S || "",
          SolidContent_Engineer_E: dataToDo.SolidContent_Engineer_E || "",
        })
    } catch (error) {
      console.error("抓取工程師資料失敗:", error);
    }
  };
  fetchEngineerData();
}, []);

  const handleInnerChange = (e) => {
  const { name, value } = e.target;
  if (selectMixing && selectMixing.length > 0 && selectMixing === "正極混漿") {
    setDataFormInner_Cathode(prevState => {
      const newState = { ...prevState, [name]: value };
      return newState;
    });
    console.log("正極混漿資料:", dataFormInner_Cathode);
    
  } else if (selectMixing && selectMixing.length > 0 && selectMixing === "負極混漿") {
    setDataFormInner_Anode(prevState => {
    const newState = {...prevState, [name]: value }
    return newState;
    }
  );
  console.log("負極混漿資料:", dataFormInner_Anode);
  }
  setCommonSettings(prevState => {
    const newState = { ...prevState, [name]: value };
    return newState;
  })
  setInnerChange(true);
}
  
   // 裝置編號變更處理
  const handleAddInput = (device) => {
    if (device === "deviceNo_Mixing") {
      if (deviceNo_Mixing.length < 15) {
        setDeviceNo_Mixing([...deviceNo_Mixing, ""]);
      } else {
        alert("最多只能添加15個內容");
      }
    }else if (device === "deviceNo_surgeTank") {
      if (deviceNo_surgeTank.length < 15) {
        setDeviceNo_surgeTank([...deviceNo_surgeTank, ""]);
      } else {
        alert("最多只能添加15個內容");
      }
    }  
    
    else if (device === "loadingTankNo") {
      if (loadingTankNo.length < 30) {
        setLoadingTankNo([...loadingTankNo, ""]);
      } else {
        alert("最多只能添加30個內容");
      }
    }

    else if (device === "receipe"){
      if (receipe.length < 15) {
        setReceipe([...receipe, ""]);
      } else {
        alert("最多只能添加15個內容");
      }
    }
  };

  // 裝置編號移除處理
  const handleRemoveInput = (device) => {
    if (device === "deviceNo_Mixing"){
      if (deviceNo_Mixing.length > 1) {
        setDeviceNo_Mixing(deviceNo_Mixing.slice(0, -1));
      } 
      else if (deviceNo_Mixing.length > 1) {
        setDeviceNo_surgeTank(deviceNo_surgeTank.slice(0, -1));
      } 
      else {
        alert("至少需要一個設備編號");
      }
    }
    else if (device === "loadingTankNo") {
      if (loadingTankNo.length > 1) {
        setLoadingTankNo(loadingTankNo.slice(0, -1));
      } else {
        alert("至少需要一個下料桶槽編號");
      }
    }
    else if (device === "receipe") { 
      if (receipe.length > 1) {
        setReceipe(receipe.slice(0, -1));
      } else {
        alert("至少需要一個配方編號");
      }
    }
    else if (device === "deviceNo_surgeTank") {
      if (deviceNo_surgeTank.length > 1) {
        setDeviceNo_surgeTank(deviceNo_surgeTank.slice(0, -1));
      } else {
        alert("至少需要一個下料桶槽編號");
      }
    }
  }

  // 設備編號變更處理
  const handleDeviceNo_MixingChange = (index, value) => {
    const newDeviceNo_Mixing = deviceNo_Mixing.map((val, i) => (i === index ? value : val));
    setDeviceNo_Mixing(newDeviceNo_Mixing);
  }
  // 暫存桶設備編號變更處理
  const handleDeviceNo_surgeTankChange = (index, value) => {
    const newDeviceNo_surgeTank = deviceNo_surgeTank.map((val, i) => (i === index ? value : val));
    setDeviceNo_surgeTank(newDeviceNo_surgeTank);
  }

  // 下料桶槽資變更處裡
  const handleLoadingTankNo = (index , value) => {
    const newLoadingTankNo = loadingTankNo.map((val, i) => (i === index ? value : val));
    setLoadingTankNo(newLoadingTankNo);
  }

  // 配方編號變更處理 
  const handleReceipeChange = (index, value) => {
    const newReceipe = receipe.map((val, i) => (i === index ? value : val));
    setReceipe(newReceipe);
  }


  const handleSubmit = async() => {
    const deviceNo_mixing_String = deviceNo_Mixing.join(",");
    const deviceNo_surgeTank_String = deviceNo_surgeTank.join(",");
    const loadingTankNoString = loadingTankNo.join(",");
    const receipeString = receipe.join(",");
    let dataToSubmit;

  try{
    if (selectMixing === "正極混漿") {
      dataToSubmit = {
        ...dataFormInner_Cathode,
        deviceNo_Mixing : deviceNo_mixing_String,
        deviceNo_surgeTank: deviceNo_surgeTank_String,
        loadingTankNo: loadingTankNoString,
        receipe: receipeString,
        selectMixing: selectMixing,
        EngineerName : login.engineerName,
        EngineerNo : login.engineerNo,
        engineerPsw : login.engineerPsw,
      };
      localStorage.setItem('mixing_Cathode', JSON.stringify(
        {
          // Cathode unique settings
          EngineerName : login.engineerName,
          EngineerNo : login.engineerNo,
          NMP_1_Loading_Weight: dataFormInner_Cathode.NMP_1_Loading_Weight || "",
          NMP_2_Loading_Weight: dataFormInner_Cathode.NMP_2_Loading_Weight || "",
          CNT_1_Loading_Weight: dataFormInner_Cathode.CNT_1_Loading_Weight || "",
          NMP_3: dataFormInner_Cathode.NMP_3 || "",
          ListNo: dataFormInner_Cathode.ListNo || "",
          Filter_Mesh : dataFormInner_Cathode.Filter_Mesh || "",
          ProductionType : dataFormInner_Cathode.ProductionType || "",
          ReceipeNo : dataFormInner_Cathode.ReceipeNo || "",
          Recipe :receipeString || "",
          deviceNo_Mixing: deviceNo_mixing_String || "",
          deviceNo_surgeTank: deviceNo_surgeTank_String || "",
          batch_time_min_Smaller: dataFormInner_Cathode.batch_time_min_Smaller || "",
          batch_time_min_Bigger: dataFormInner_Cathode.batch_time_min_Bigger || "",
          MixingSelect: selectMixing || "",
          loadingTankNo: loadingTankNoString || "",

          // common settings
          Nvalue_Engineer_S: commonSettings.Nvalue_Engineer_S || "",
          Nvalue_Engineer_E: commonSettings.Nvalue_Engineer_E || "",
          SolidContent_Engineer_S: commonSettings.SolidContent_Engineer_S || "",
          SolidContent_Engineer_E: commonSettings.SolidContent_Engineer_E || "",
          Viscosity_Engineer_S: commonSettings.Viscosity_Engineer_S || "",
          Viscosity_Engineer_E: commonSettings.Viscosity_Engineer_E || "",
          ParticalSize_Engineer_S: commonSettings.ParticalSize_Engineer_S || "",
          ParticalSize_Engineer_E: commonSettings.ParticalSize_Engineer_E || "",
        }
      ));
      const response = await api.callset_engineerDataSet(
        Submittime,
        login.engineerName,
        login.engineerNo,
        login.engineerPsw,
        dataFormInner_Cathode.ProductionType || "",
        selectMixing,
        dataFormInner_Cathode.ReceipeNo || "",
        deviceNo_mixing_String || "",
        deviceNo_surgeTank_String || "",
        receipeString || "",
        dataFormInner_Cathode.Filter_Mesh || "",
        dataFormInner_Cathode.batch_time_min_Smaller || "",
        dataFormInner_Cathode.batch_time_min_Bigger || "",
        "", // Water_1_LoadingWeight
        "", // Water_2_LoadingWeight
        "", // Water_3_LoadingWeight
        "", // NMP
        dataFormInner_Cathode.NMP_1_Loading_Weight || "",
        dataFormInner_Cathode.NMP_2_Loading_Weight || "",
        dataFormInner_Cathode.CNT_1_Loading_Weight || "",
        dataFormInner_Cathode.NMP_3 || "",
        loadingTankNoString || "",
        dataFormInner_Cathode.ListNo || "",

        // common settings to be added in backend
        commonSettings.Nvalue_Engineer_S ? commonSettings.Nvalue_Engineer_S : "",
        commonSettings.Nvalue_Engineer_E ? commonSettings.Nvalue_Engineer_E : "",
        commonSettings.SolidContent_Engineer_S ? commonSettings.SolidContent_Engineer_S : "",
        commonSettings.SolidContent_Engineer_E ? commonSettings.SolidContent_Engineer_E : "",
        commonSettings.Viscosity_Engineer_S ? commonSettings.Viscosity_Engineer_S : "",
        commonSettings.Viscosity_Engineer_E ? commonSettings.Viscosity_Engineer_E : "",
        commonSettings.ParticalSize_Engineer_S ? commonSettings.ParticalSize_Engineer_S : "",
        commonSettings.ParticalSize_Engineer_E ? commonSettings.ParticalSize_Engineer_E : ""

      );
    handleDataAll(dataToSubmit);
    setInnerChange(false);
    } 
    else if (selectMixing === "負極混漿") {
      dataToSubmit = {
        ...dataFormInner_Anode,
        deviceNo_Mixing: deviceNo_mixing_String,
        deviceNo_surgeTank: deviceNo_surgeTank_String,
        loadingTankNo: loadingTankNoString,
        selectMixing: selectMixing,
        receipe: receipeString,
        EngineerName : login.engineerName,
        EngineerNo : login.engineerNo,
        engineerPsw : login.engineerPsw,
      };
      localStorage.setItem('mixing_Anode', JSON.stringify(
        {
          EngineerName : login.engineerName,
          EngineerNo : login.engineerNo,
          Water_1_LoadingWeight: dataFormInner_Anode.Water_1_LoadingWeight || "",
          Water_2_LoadingWeight: dataFormInner_Anode.Water_2_LoadingWeight || "",
          NMP: dataFormInner_Anode.NMP || "",
          Water_3_LoadingWeight: dataFormInner_Anode.Water_3_LoadingWeight || "",
          ListNo: dataFormInner_Anode.ListNo || "",
          Filter_Mesh : dataFormInner_Anode.Filter_Mesh || "",
          ProductionType : dataFormInner_Anode.ProductionType || "",
          ReceipeNo : dataFormInner_Anode.ReceipeNo || "",
          Recipe : receipeString || "",
          deviceNo_Mixing: deviceNo_mixing_String || "",
          deviceNo_surgeTank: deviceNo_surgeTank_String || "",
          batch_time_min_Smaller: dataFormInner_Anode.batch_time_min_Smaller || "",
          batch_time_min_Bigger: dataFormInner_Anode.batch_time_min_Bigger || "",
          MixingSelect: selectMixing || "",
          loadingTankNo: loadingTankNoString || "",

          // common settings
          Nvalue_Engineer_S: commonSettings.Nvalue_Engineer_S || "",
          Nvalue_Engineer_E: commonSettings.Nvalue_Engineer_E || "",
          SolidContent_Engineer_S: commonSettings.SolidContent_Engineer_S || "",
          SolidContent_Engineer_E: commonSettings.SolidContent_Engineer_E || "",
          Viscosity_Engineer_S: commonSettings.Viscosity_Engineer_S || "",
          Viscosity_Engineer_E: commonSettings.Viscosity_Engineer_E || "",
          ParticalSize_Engineer_S: commonSettings.ParticalSize_Engineer_S || "",
          ParticalSize_Engineer_E: commonSettings.ParticalSize_Engineer_E || "",
        }
      ));
      const response = await api.callset_engineerDataSet(
          Submittime,
          login.engineerName,
          login.engineerNo,
          login.engineerPsw,
          dataFormInner_Anode.ProductionType || "",
          selectMixing,
          dataFormInner_Anode.ReceipeNo || "",
          deviceNo_mixing_String || "",
          deviceNo_surgeTank_String || "",
          receipeString || "",
          dataFormInner_Anode.Filter_Mesh || "",
          dataFormInner_Anode.batch_time_min_Smaller || "",
          dataFormInner_Anode.batch_time_min_Bigger || "",
          dataFormInner_Anode.Water_1_LoadingWeight || "",
          dataFormInner_Anode.Water_2_LoadingWeight || "",
          dataFormInner_Anode.Water_3_LoadingWeight || "",
          dataFormInner_Anode.NMP || "",
          "", // NMP_1_Loading_Weight
          "", // NMP_2_Loading_Weight
          "", // CNT_1_Loading_Weight
          "", // NMP_3
          loadingTankNoString || "",
          dataFormInner_Anode.ListNo || "",

        // common settings to be added in backend
        commonSettings.Nvalue_Engineer_S ? commonSettings.Nvalue_Engineer_S : "",
        commonSettings.Nvalue_Engineer_E ? commonSettings.Nvalue_Engineer_E : "",
        commonSettings.SolidContent_Engineer_S ? commonSettings.SolidContent_Engineer_S : "",
        commonSettings.SolidContent_Engineer_E ? commonSettings.SolidContent_Engineer_E : "",
        commonSettings.Viscosity_Engineer_S ? commonSettings.Viscosity_Engineer_S : "",
        commonSettings.Viscosity_Engineer_E ? commonSettings.Viscosity_Engineer_E : "",
        commonSettings.ParticalSize_Engineer_S ? commonSettings.ParticalSize_Engineer_S : "",
        commonSettings.ParticalSize_Engineer_E ? commonSettings.ParticalSize_Engineer_E : ""
        )
      }
      console.log("工程師表單提交資料:", dataToSubmit);
      handleDataAll(dataToSubmit);
      setInnerChange(false);
      }catch (error) {
      console.error("提交資料時發生錯誤:", error);
      return;
    }
  };

    
  return (
    <Modal show={show} onHide={onBackLogin} backdrop="static" centered={centered}>
      <Modal.Header closeButton>
        <Modal.Title className='title' style={{display: "flex", justifyContent: "center" ,flexDirection: "column" , alignItems: "center"}}>
          <div style={{fontSize: "2rem" , justifyContent: "center"}}>工程師登入頁面</div>
          <div style={{fontSize: "1.5rem"}}>【{selectMixing}】</div>
        </Modal.Title>
      </Modal.Header>
      {selectMixing && selectMixing.length > 0 && selectMixing === "正極混漿" ? (
        <div>
          <Modal.Body>
            <Form.Check // prettier-ignore
              type="switch"
              id="custom-switch"
              label="切換設定頁面 | Switch Setting Information"
              checked={switchBar}
              onChange={() => setSwitchBar(!switchBar)}
            />
            {
              !switchBar ? (
                <>
                <Form>
                    <Form.Group className="innerTitle">
                      <Form.Label>生產型態(ProductionType)</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="input..."
                        name="ProductionType"
                        value={dataFormInner_Cathode.ProductionType || ''}
                        onChange={handleInnerChange}
                      />
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>配方編號(Slurry Recipe)</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="input..."
                        name="ReceipeNo"
                        value={dataFormInner_Cathode.ReceipeNo || ''}
                        onChange={handleInnerChange}
                      />
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>混漿設備編號(Device No)</Form.Label>
                      <Button
                        variant="warning"
                        style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                        onClick={() => handleAddInput('deviceNo_Mixing')}
                        disabled={deviceNo_Mixing.length >= 10}
                      >
                        +
                      </Button>
                      <Button
                        variant="warning"
                        style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                        onClick={() => handleRemoveInput('deviceNo_Mixing')} 
                        disabled={deviceNo_Mixing.length >= 10}
                      >
                        -
                      </Button>
                        <div style={{ marginTop: "0.5rem" }}>
                          {deviceNo_Mixing.map((val, idx) => (
                            <Form.Control
                              key={idx}
                              type="text"
                              placeholder= "input..."
                              value={val}
                              style={{ marginBottom: "0.3rem" }}
                              onChange={(e) => handleDeviceNo_MixingChange(idx, e.target.value)}
                            />
                          ))}
                        </div>
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>暫存桶設備編號(Device No)</Form.Label>
                      <Button
                        variant="warning"
                        style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                        onClick={() => handleAddInput('deviceNo_surgeTank')}
                        disabled={deviceNo_surgeTank.length >= 10}
                      >
                        +
                      </Button>
                      <Button
                        variant="warning"
                        style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                        onClick={() => handleRemoveInput('deviceNo_surgeTank')} 
                        disabled={deviceNo_surgeTank.length >= 10}
                      >
                        -
                      </Button>
                        <div style={{ marginTop: "0.5rem" }}>
                          {deviceNo_surgeTank.map((val, idx) => (
                            <Form.Control
                              key={idx}
                              type="text"
                              placeholder="input..."
                              value={val}
                              style={{ marginBottom: "0.3rem" }}
                              onChange={(e) => handleDeviceNo_surgeTankChange(idx, e.target.value)}
                            />
                          ))}
                        </div>
                    </Form.Group>

                    <Form.Group className="innerTitle">
                      <Form.Label>下料桶槽 (the loading tank No.) </Form.Label>
                      <Button
                        variant="warning"
                        style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                        onClick={() => handleAddInput('loadingTankNo')}
                        disabled={loadingTankNo.length >= 15}
                      >
                        +
                      </Button>
                      <Button
                        variant="warning"
                        style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                        onClick={() => handleRemoveInput('loadingTankNo')}
                        disabled={loadingTankNo.length >= 15}
                      >
                        -
                      </Button>
                      <div style={{ marginTop: "0.5rem" }}>
                        {loadingTankNo.map((val, idx) => (
                          <Form.Control
                            key={idx}
                            type="text"
                            placeholder="input..."
                            value={val}
                            style={{ marginBottom: "0.3rem" }}
                            onChange={(e) => handleLoadingTankNo(idx, e.target.value)}
                          />
                        ))}
                      </div>
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>List No.</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="input..."
                        name="ListNo"
                        value={dataFormInner_Cathode.ListNo || ''}
                        onChange={handleInnerChange}
                      />
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>配方(machineRecipe)</Form.Label>
                      <Button
                        variant="warning"
                        style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                        onClick={() => handleAddInput('receipe')}
                        disabled={receipe.length >= 15}
                      >
                        +
                      </Button>
                      <Button
                        variant="warning"
                        style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                        onClick={() => handleRemoveInput('receipe')}
                        disabled={receipe.length >= 15}
                      >
                        -
                      </Button>
                        <div style={{ marginTop: "0.5rem" }}>
                          {receipe.map((val, idx) => (
                            <Form.Control
                              key={idx}
                              type="text"
                              placeholder="input..."
                              value={val}
                              style={{ marginBottom: "0.3rem" }}
                              onChange={(e) => handleReceipeChange(idx, e.target.value)}
                            />
                          ))}
                        </div>
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>濾心目數(Filter Mesh)</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="input..."
                        name="Filter_Mesh"
                        value={dataFormInner_Cathode.Filter_Mesh || ''}
                        onChange={handleInnerChange}
                      />
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>批次時間(batch time [min])|小於</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="input..."
                        name="batch_time_min_Smaller"
                        value={dataFormInner_Cathode.batch_time_min_Smaller || ''}
                        onChange={handleInnerChange}
                      />
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>批次時間(batch time [min])|大於</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="input..."
                        name="batch_time_min_Bigger"
                        value={dataFormInner_Cathode.batch_time_min_Bigger || ''}
                        onChange={handleInnerChange}
                      />
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>CNT_1_Loading_Weight</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="input..."
                        name="CNT_1_Loading_Weight"
                        value={dataFormInner_Cathode.CNT_1_Loading_Weight || ''}
                        onChange={handleInnerChange}
                      />
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>NMP_1_Loading_Weight</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="input..."
                        name="NMP_1_Loading_Weight"
                        value={dataFormInner_Cathode.NMP_1_Loading_Weight || ''}
                        onChange={handleInnerChange}
                      />
                    </Form.Group>
                    <Form.Group className="innerTitle">
                      <Form.Label>NMP_2_Loading_Weight</Form.Label>
                      <Form.Control
                          type="text"
                          placeholder="input..."
                          name="NMP_2_Loading_Weight"
                          value={dataFormInner_Cathode.NMP_2_Loading_Weight || ''}
                          onChange={handleInnerChange}
                        />
                      </Form.Group>
                      <Form.Group className="innerTitle">
                      <Form.Label>NMP_3</Form.Label>
                      <Form.Control
                          type="text"
                          placeholder="input..."
                          name="NMP_3"
                          value={dataFormInner_Cathode.NMP_3 || ''}
                          onChange={handleInnerChange}
                        />
                      </Form.Group>
                  </Form>
                </>
              ): (
                <Form>
                  <Form.Group>
                    <Form>
                  {/* Nvalue */}
                  <div style={{ marginBottom: "1rem", padding: "0.8rem", backgroundColor: "white", borderRadius: "5px", border: "1px solid #dee2e6" }}>
                    <Form.Label style={{ fontWeight: "600", color: "#495057", marginBottom: "0.5rem" }}>N值 (Nvalue)</Form.Label>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>起始值 (Start)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="Nvalue_Engineer_S"
                          value={commonSettings.Nvalue_Engineer_S || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>結束值 (End)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="Nvalue_Engineer_E"
                          value={commonSettings.Nvalue_Engineer_E || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Viscosity */}
                  <div style={{ marginBottom: "1rem", padding: "0.8rem", backgroundColor: "white", borderRadius: "5px", border: "1px solid #dee2e6" }}>
                    <Form.Label style={{ fontWeight: "600", color: "#495057", marginBottom: "0.5rem" }}>黏度 (Viscosity)</Form.Label>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>起始值 (Start)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="Viscosity_Engineer_S"
                          value={commonSettings.Viscosity_Engineer_S || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>結束值 (End)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="Viscosity_Engineer_E"
                          value={commonSettings.Viscosity_Engineer_E || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Particle Size */}
                  <div style={{ marginBottom: "1rem", padding: "0.8rem", backgroundColor: "white", borderRadius: "5px", border: "1px solid #dee2e6" }}>
                    <Form.Label style={{ fontWeight: "600", color: "#495057", marginBottom: "0.5rem" }}>粒徑 (Particle Size)</Form.Label>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>起始值 (Start)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="ParticalSize_Engineer_S"
                          value={commonSettings.ParticalSize_Engineer_S || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>結束值 (End)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="ParticalSize_Engineer_E"
                          value={commonSettings.ParticalSize_Engineer_E || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Solid Content */}
                  <div style={{ marginBottom: "1rem", padding: "0.8rem", backgroundColor: "white", borderRadius: "5px", border: "1px solid #dee2e6" }}>
                    <Form.Label style={{ fontWeight: "600", color: "#495057", marginBottom: "0.5rem" }}>固含量 (Solid Content)</Form.Label>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>起始值 (Start)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="SolidContent_Engineer_S"
                          value={commonSettings.SolidContent_Engineer_S || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>結束值 (End)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="SolidContent_Engineer_E"
                          value={commonSettings.SolidContent_Engineer_E || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                    </div>
                  </div>
                </Form>
                  </Form.Group>
                </Form>
              )
            }
          </Modal.Body>
        </div>
      ) : (
        <div>
          <Modal.Body>
            <Form.Check // prettier-ignore
              type="switch"
              id="custom-switch"
              label="切換設定頁面 | Switch Setting Information"
              checked={switchBar}
              onChange={() => setSwitchBar(!switchBar)}
            />
            {
            !switchBar ? (
              <Form>
              <Form.Group className="innerTitle">
                <Form.Label>生產型態(ProductionType)</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="ProductionType"
                  value={dataFormInner_Anode.ProductionType || ''}
                  onChange={handleInnerChange}
                />
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>配方編號(Slurry Recipe)</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="ReceipeNo"
                  value={dataFormInner_Anode.ReceipeNo || ''}
                  onChange={handleInnerChange}
                />
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>設備編號(Device No)</Form.Label>
                <Button
                  variant="warning"
                  style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                  onClick={() => handleAddInput('deviceNo_Mixing')} // 傳遞 'deviceNo'
                  disabled={deviceNo_Mixing.length >= 10}
                >
                  +
                </Button>
                <Button
                  variant="warning"
                  style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                  onClick={() => handleRemoveInput('deviceNo_Mixing')} // 傳遞 'deviceNo'
                  disabled={deviceNo_Mixing.length >= 10}
                >
                  -
                </Button>
                  <div style={{ marginTop: "0.5rem" }}>
                    {deviceNo_Mixing.map((val, idx) => (
                      <Form.Control
                        key={idx}
                        type="text"
                        placeholder="input..."
                        value={val}
                        style={{ marginBottom: "0.3rem" }}
                        onChange={(e) => handleDeviceNo_MixingChange(idx, e.target.value)}
                      />
                    ))}
                  </div>
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>暫存桶設備編號(Device No)</Form.Label>
                <Button
                  variant="warning"
                  style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                  onClick={() => handleAddInput('deviceNo_surgeTank')}
                  disabled={deviceNo_surgeTank.length >= 10}
                >
                  +
                </Button>
                <Button
                  variant="warning"
                  style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                  onClick={() => handleRemoveInput('deviceNo_surgeTank')} 
                  disabled={deviceNo_surgeTank.length >= 10}
                >
                  -
                </Button>
                  <div style={{ marginTop: "0.5rem" }}>
                    {deviceNo_surgeTank.map((val, idx) => (
                      <Form.Control
                        key={idx}
                        type="text"
                        placeholder="input..."
                        value={val}
                        style={{ marginBottom: "0.3rem" }}
                        onChange={(e) => handleDeviceNo_surgeTankChange(idx, e.target.value)}
                      />
                    ))}
                  </div>
              </Form.Group>

              <Form.Group className="innerTitle">
                <Form.Label>下料桶槽 (the loading tank No.) </Form.Label>
                <Button
                  variant="warning"
                  style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                  onClick={() => handleAddInput('loadingTankNo')} // 傳遞 'loadingTankNo'
                  disabled={loadingTankNo.length >= 15}
                >
                  +
                </Button>
                <Button
                  variant="warning"
                  style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                  onClick={() => handleRemoveInput('loadingTankNo')} // 傳遞 'loadingTankNo'
                  disabled={loadingTankNo.length >= 15}
                >
                  -
                </Button>
                <div style={{ marginTop: "0.5rem" }}>
                  {loadingTankNo.map((val, idx) => (
                    <Form.Control
                      key={idx}
                      type="text"
                      placeholder="input..."
                      value={val}
                      style={{ marginBottom: "0.3rem" }}
                      onChange={(e) => handleLoadingTankNo(idx, e.target.value)}
                    />
                  ))}
                </div>
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>配方(machineRecipe)</Form.Label>
                <Button
                  variant="warning"
                  style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                  onClick={() => handleAddInput('receipe')}
                  disabled={receipe.length >= 15}
                >
                  +
                </Button>
                <Button
                  variant="warning"
                  style={{ marginLeft: "0.5rem", padding: "0.5px 5px 0.5px 5px", fontSize: "1rem", fontWeight: "900" }}
                  onClick={() => handleRemoveInput('receipe')}
                  disabled={receipe.length >= 15}
                >
                  -
                </Button>
                  <div style={{ marginTop: "0.5rem" }}>
                    {receipe.map((val, idx) => (
                      <Form.Control
                        key={idx}
                        type="text"
                        placeholder="input..."
                        value={val}
                        style={{ marginBottom: "0.3rem" }}
                        onChange={(e) => handleReceipeChange(idx, e.target.value)}
                      />
                    ))}
                  </div>
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>List No.</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="ListNo"
                  value={dataFormInner_Anode.ListNo || ''}
                  onChange={handleInnerChange}
                />
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>濾心目數 (Filter Mesh)</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="Filter_Mesh"
                  value={dataFormInner_Anode.Filter_Mesh || ''}
                  onChange={handleInnerChange}
                />
              </Form.Group>
                <Form.Group className="innerTitle">
                <Form.Label>批次時間(batch time [min])|小於</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="batch_time_min_Smaller"
                  value={dataFormInner_Anode.batch_time_min_Smaller || ''}
                  onChange={handleInnerChange}
                />
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>批次時間(batch time [min])|大於</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="batch_time_min_Bigger"
                  value={dataFormInner_Anode.batch_time_min_Bigger || ''}
                  onChange={handleInnerChange}
                />
                </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>Water_1_LoadingWeight</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="Water_1_LoadingWeight"
                  value={dataFormInner_Anode.Water_1_LoadingWeight || ''}
                  onChange={handleInnerChange}
                />
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>Water_2_LoadingWeight</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="Water_2_LoadingWeight"
                  value={dataFormInner_Anode.Water_2_LoadingWeight || ''}
                  onChange={handleInnerChange}
                />
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>NMP</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="NMP"
                  value={dataFormInner_Anode.NMP || ''}
                  onChange={handleInnerChange}
                />
              </Form.Group>
              <Form.Group className="innerTitle">
                <Form.Label>Water_3_LoadingWeight</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="input..."
                  name="Water_3_LoadingWeight"
                  value={dataFormInner_Anode.Water_3_LoadingWeight || ''}
                  onChange={handleInnerChange}
                />
              </Form.Group>
            </Form>
              
            ) : (
              <Form>
                  <Form.Group>
                    <Form>
                  {/* Nvalue */}
                  <div style={{ marginBottom: "1rem", padding: "0.8rem", backgroundColor: "white", borderRadius: "5px", border: "1px solid #dee2e6" }}>
                    <Form.Label style={{ fontWeight: "600", color: "#495057", marginBottom: "0.5rem" }}>N值 (Nvalue)</Form.Label>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>起始值 (Start)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="Nvalue_Engineer_S"
                          value={commonSettings.Nvalue_Engineer_S || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>結束值 (End)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="Nvalue_Engineer_E"
                          value={commonSettings.Nvalue_Engineer_E || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Viscosity */}
                  <div style={{ marginBottom: "1rem", padding: "0.8rem", backgroundColor: "white", borderRadius: "5px", border: "1px solid #dee2e6" }}>
                    <Form.Label style={{ fontWeight: "600", color: "#495057", marginBottom: "0.5rem" }}>黏度 (Viscosity)</Form.Label>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>起始值 (Start)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="Viscosity_Engineer_S"
                          value={commonSettings.Viscosity_Engineer_S || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>結束值 (End)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="Viscosity_Engineer_E"
                          value={commonSettings.Viscosity_Engineer_E || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Particle Size */}
                  <div style={{ marginBottom: "1rem", padding: "0.8rem", backgroundColor: "white", borderRadius: "5px", border: "1px solid #dee2e6" }}>
                    <Form.Label style={{ fontWeight: "600", color: "#495057", marginBottom: "0.5rem" }}>粒徑 (Particle Size)</Form.Label>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>起始值 (Start)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="ParticalSize_Engineer_S"
                          value={commonSettings.ParticalSize_Engineer_S || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>結束值 (End)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="ParticalSize_Engineer_E"
                          value={commonSettings.ParticalSize_Engineer_E || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Solid Content */}
                  <div style={{ marginBottom: "1rem", padding: "0.8rem", backgroundColor: "white", borderRadius: "5px", border: "1px solid #dee2e6" }}>
                    <Form.Label style={{ fontWeight: "600", color: "#495057", marginBottom: "0.5rem" }}>固含量 (Solid Content)</Form.Label>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>起始值 (Start)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="SolidContent_Engineer_S"
                          value={commonSettings.SolidContent_Engineer_S || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Form.Label style={{ fontSize: "0.9rem", color: "#6c757d" }}>結束值 (End)</Form.Label>
                        <Form.Control
                          type="text"
                          placeholder="input..."
                          name="SolidContent_Engineer_E"
                          value={commonSettings.SolidContent_Engineer_E || ''}
                          onChange={handleInnerChange}
                        />
                      </div>
                    </div>
                  </div>
                </Form>
                  </Form.Group>
                </Form>

            )

            }
            
          </Modal.Body>
        </div>
      )}
      <Modal.Footer>
        <Button variant="primary" onClick={()=>handleSubmit()}>提交 | Submit</Button>
        <Button variant="secondary" onClick={onBackLogin}>取消 | Cancel</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default EngineerDetail;