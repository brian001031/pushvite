/* eslint-disable jsx-a11y/anchor-is-valid */
import React, { useState } from "react";
import { Form, Button } from "react-bootstrap";
import axios from "axios";
import dayjs from "dayjs";
import config from "../../config";
import "./index.scss";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import FixPopform from "../../components/FixPopform";

const RepairRequest = () => {
  const [formData, setFormData] = useState({
    name: "", //填擔人員名稱
    time: dayjs().format("YYYY-MM-DDTHH:mm"),
    place: "2樓組裝區", //區域
    machine: "", //設備名稱
    errorcode: "", //設備錯誤代碼
    machineStatus: "觀察中",
    question: "", //故障問題
    photos: null, //照片
    photoInfo: [],
  });

  //目前設備list清單,持續新增新設備
  const mechanical_device = [
    "M01115-落粉機(正)",
    "M01116-落粉機(負)",
    "M00108-乳化機7.5kw",
    "M00101-乳化機11.5kw",
    "M00113-正極混漿機100L-1",
    "M00114-正極混漿機100L-2",
    "M01117-EIRICH負極混漿機",
    "M00163-正極全自動塗佈機",
    "M01118-政鈺正極全自動塗佈機",
    "M00138-負極全自動塗佈機",
    "M01119-政鈺負極全自動塗佈機",
    "M00088-負極混漿機60L",
    "M00087-負極混漿機150L",
    "M01120-EIRICH負極混漿機",
    "M00905-疊片機(1)",
    "M00906-疊片機(2)",
    "M01121-疊片機(3)",
    "M01122-疊片機(4)",
    "M01123-疊片機(5)",
    "M01124-疊片物流線",
    "M01125-自動焊接入殼機",
    "M01097-鋁塑膜沖坑機",
    "M00910-鋁塑膜成型切邊機",
    "M00911-頂封機(負極)",
    "M00912-頂封機(正極)",
    "M00913-側封機",
    "M01098-極耳壓平用",
    "M01099-側封切邊機",
    "M00908-正極超聲波焊接機",
    "M00908-負極超聲波焊接機",
    "M00730-(豪優)正極超聲波焊接機",
    "M00731-(豪優)負極超聲波焊接機",
    "M00732-(德國)正極超聲波焊接機",
    "M00732-(德國)負極超聲波焊接機",
    "M00907-極耳裁切機",
    "M00914-全自動真空烘箱(負極烘箱)",
    "M01100-全自動真空烘箱(正極烘箱)",
    "M00455-正極輾壓機(三輪)",
    "M01101-正極輾壓機(雙輪)",
    "M01126-BREYER輾壓機(正負)",
    "M01127-西村分條機",
    "M00899-正極五金模切機(1號機)",
    "M01128-負極五金模切機(2號機)",
    "M00225-負極模切機(F)",
    "M00226-負極模切機(H)",
    "M00900-分條機",
    "M00936-自動注液機",
    "M01129-孟申自動注液機",
    "M00932-三層對開門真空乾燥箱",
    "M00933-注液間真空烘箱",
    "M00934-注液間真空烘箱",
    "M00935-注液間真空烘箱",
    "M00950-加壓化成機(8)",
    "M01104-直線三封機",
    "M01105-孟申二次封機",
    "M01130-孟申二次封機",
    "M00959-電池成品精封機",
    "M00960-成品切邊機",
    "M01131-台塑重工升降機(正)",
    "M01132-台塑重工升降機(負)",
    "M01133-極片除水設備",
    "M01134-真空烘烤爐",
    "M01135-右洋電檢機",
    "M01136-電化學加壓化成PF機18-1",
    "M01154-分容分選CC1",
    "M01155-分容分選CC2",
    "M01156-分容分選CC3",
    "M01157-分容分選CC4",
    "M01158-分容分選CC5",
    "M01159-分容分選CC6",
    "M01160-分容分選CC7",
    "M01161-分容分選CC8",
    "M01162-分容分選CC9",
    "M01163-常溫倉儲",
    "M01164-高溫倉儲",
    "M01165-電壓檢測(高溫區)",
    "M01166-電壓檢測(常溫區)",
    "M01167-輸送線A",
    "M01168-輸送線B",
    "M01169-輸送線C",
    "M01703-輸送線D",
    "M01702-輸送線E",
    "M01170-精封折邊機",
    "M01171-分類檢測",
    "M01172-分選機",
    "M01410-分條機(2)",
    "M01706-PF-CC-IN裝箱",
    "M01707-PF-CC-OUT分容",
    "M02079-電化學加壓化成前",
    "M02080-正極塗佈機",
    "M02081-中轉桶400-1",
    "M02082-中轉桶400-2",
    "M02083-中轉桶400-3",
    "M02084-中轉桶400-4",
    "M02085-中轉桶400-5",
    "M02086-中轉桶400-6",
    "M02087-乳化機3",
    "M02088-乳化機4",
    "M02089-乳化機5",
    "M02090-五金模切機(3號正極)",
    "M02091-五金模切機(4號負極)",
    "M02092-右洋疊片機(6)",
    "M02093-右洋疊片機(7)",
    "M02094-右洋疊片機(8)",
    "M02095-右洋疊片機(9)",
    "M02096-輸送線2",
    "M02097-自動入殼機(2)",
    "M02098-三封機(1)",
    "M02099-三封機(2)",
    "M02100-電化學加壓化成PF入出料機",
    "M02101-分容分選入出料機1",
    "M02102-分容分選入出料機2",
    "M02103-2期輸送線",
    "M02104-孟申電檢機",
    "M02105-2期精封機",
    "M02106-常溫區電檢機",
    "M02107-自動注液機2",
    "M02108-利隆興輸送帶2",
    "M02109-常溫區堆垛機",
    "M02110-分容分選CC機10",
    "M02111-分容分選CC機11",
    "M02112-分容分選CC機12",
    "M02113-分容分選CC機13",
    "M02114-分容分選CC機14",
    "M02115-分容分選CC機15",
    "M02116-分容分選CC機16",
    "M02117-分容分選CC機17",
    "M02118-分容分選CC機18",
    "M02119-分容分選CC機19",
    "M02120-電化學加壓化成PF機10-1",
    "M02121-電化學加壓化成PF機10-2",
    "M02122-電化學加壓化成PF機10-3",
    "M02123-電化學加壓化成PF機10-4",
    "M02124-電化學加壓化成PF機10-5",
    "M02125-電化學加壓化成PF機10-6",
    "M02126-電化學加壓化成PF機10-7",
    "M02127-電化學加壓化成PF機10-8",
    "M02128-電化學加壓化成PF機10-9",
    "M02129-電化學加壓化成PF機10-10",
    "M02667-ORION循環水冷卻機",
    "M02668-ORION循環水冷卻機",
    "M02669-ORION循環水冷卻機",
    "M02720-EIRICH正極混漿機(一樓)",
    "M002632-信力特疊片機",
    "M003370-信力特疊片機",
    "M003371-信力特疊片機",
    // "M00687-HAHO-雷射焊接自動化機台-客製",
    "M01174-電池芯測立站",
    "M01175-機械手臂(測立翻轉站用)",
    "M01176-電池排列翻轉站",
    "M01177-連接件安裝站",
    "M01412-雷射焊接站",
    "M01178-壓折極耳站",
    "M01179-整線段",
    "M01180-模組外殼安裝站",
    "M01173-堆疊機",
    /*新增20251030設備列--start*/
    "M01662-電芯自動堆疊機",
    "M01663-電芯自動側立機",
    "M01664-電芯排列機械手臂",
    "M01665-機械手臂電腦主機",
    "M01666-模組翻轉設備",
    "M01667-連接件安裝設備",
    "M01668-連接件安裝設備主機",
    "M01669-模組輸送設備",
    "M01670-壓折極耳設備",
    "M01671-整線段設備",
    "M01672-外殼安裝站設備",
    /*---end---*/
  ];

  //目前錯誤碼列舉,持續新增新定義狀態
  const errcode_option = [
    "E006",
    "I015.2",
    "M3210",
    "M3200",
    "M0000",
    "M3152",
    "M02091",
    "MR8304",
    "MR6805",
    "M3136",
    "MR7112",
    "M01125",
    "M0307",
    "M1006",
    "NA0",
    "R2109",
    "00c",
  ];

  //姓名的下拉選項
  const [options, setOptions] = useState([]);
  //跳轉要用到的東西
  const navigate = useNavigate();

  // 數有幾個檔案
  const [fileCount, setFileCount] = useState(0);

  //用來儲存經過篩選的選項，只顯示與輸入關鍵字匹配的選項
  //機械設備選項
  const [filteredDeviceOptions, setFilteredDeviceOptions] = useState([]);
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);

  //錯別碼選項
  const [filteredErrorOptions, setFilteredErrorOptions] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [showModal, setShowModal] = useState(false); // For controlling modal visibility

  //判斷設備名稱,錯誤碼輸入有效與否
  const [ismachineValid, setIsmachineValid] = useState(false);
  const [isErrCodeValid, setIsErrCodeValid] = useState(false);
  // 正規表達式判斷是否包含英文和數字
  const regex_repairerr = /^(?=.*[a-zA-Z])(?=.*\d).+$/;

  const openModal = () => {
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  //這個是處理表單填寫
  const handleChange = async (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (name === "name") {
      if (value === "") {
        setOptions([]);
        return;
      }
      try {
        const response = await axios.get(
          `${config.apiBaseUrl}/employee/getEmployeesByIDOrName`,
          {
            params: {
              query: value,
            },
          }
        );
        setOptions(response.data); // 設置選项
      } catch (error) {
        console.error("Error fetching options:", error);
      }
    }

    //判定設備代碼有無輸入格式錯誤(En+數字)
    if (name === "machine") {
      const machine_str = value;
      if (machine_str.length >= 1 || value !== "") {
        // 篩選設備名稱選項
        const machine_realtive = mechanical_device.filter((option) =>
          option.toUpperCase().includes(machine_str.toUpperCase())
        );
        setFilteredDeviceOptions(machine_realtive);
        setIsDeviceDropdownOpen(true);

        //輸入報修設備當下狀態有錯誤以下可能
        if (!regex_repairerr.test(machine_str)) {
          setIsmachineValid(false);
        } else {
          setIsmachineValid(true);
        }
      } else {
        setFilteredDeviceOptions([]);
        setIsDeviceDropdownOpen(false);
      }
    }

    //判定報修設備錯誤代碼有無輸入格式錯誤(En+數字)
    if (name === "errorcode") {
      const error_str = value;
      if (error_str.length >= 1 || value !== "") {
        // 篩選錯誤碼選項
        const filtered = errcode_option.filter((option) =>
          option.toLowerCase().includes(error_str.toLowerCase())
        );
        setFilteredErrorOptions(filtered);
        setIsDropdownOpen(true);

        //取errorcode當下輸入狀態有錯誤以下可能
        if (!regex_repairerr.test(error_str)) {
          setIsErrCodeValid(false);
        } else {
          setIsErrCodeValid(true);
        }
      } else {
        setFilteredErrorOptions([]);
        setIsDropdownOpen(false);
      }

      // console.log("Error錯誤碼比對狀態:" + regex_repairerr.test(value));
    }
  };

  //這個處理送出圖片
  const allowedExtensions = ["png", "jpg", "jpeg", "webp"];
  const handleFileChange = (e) => {
    const files = e.target.files;
    let newImages = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExtension = file.name.split(".").pop().toLowerCase();
      if (
        !allowedExtensions.includes(fileExtension) ||
        newImages.length >= 10
      ) {
        // 如果檔案副檔名不在允許的清單中，或者已經有十張圖片，拒絕上傳
        console.log("拒絕上傳：", fileExtension);
      } else {
        console.log("允許上傳：", file.name);
        newImages.push(file);
      }
    }
    // 更新 formData 中的圖片陣列
    setFormData({ ...formData, photos: newImages });
    // 更新上傳的檔案數量
    setFileCount(newImages.length);
  };

  //這個處理提交事件
  const handleSubmit = async (e) => {
    e.preventDefault();

    // if (!ismachineValid) {
    //   toast.error("設備及編碼號尚未完整!");
    //   return;
    // }

    if (!isErrCodeValid) {
      toast.error("錯誤碼需要包含(英文+數字)!");
      return;
    }

    const formDataToSend = new FormData();
    formDataToSend.append("name", formData.name);
    formDataToSend.append("time", formData.time);
    formDataToSend.append("place", formData.place);
    formDataToSend.append("machine", formData.machine);
    formDataToSend.append("errorcode", formData.errorcode);
    formDataToSend.append("machineStatus", formData.machineStatus);
    formDataToSend.append("question", formData.question);
    if (formData.photos && formData.photos.length > 0) {
      formData.photos.forEach((photo) => {
        formDataToSend.append("photos", photo);
      });
    }
    formData.photoInfo.forEach((info, index) => {
      formDataToSend.append(`photoInfo[${index}]`, info);
    });
    console.log(formData);
    try {
      const response = await axios.post(
        `${config.apiBaseUrl}/repair/repair_question`,
       // "http://localhost:3009/repair/repair_question",
        formDataToSend,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      if (response.status === 201) {
        toast.success("資料保存成功");
        console.log("資料保存成功");
        navigate("/repairList");

        // 這裡可以加上顯示成功訊息的邏輯，例如彈出提示框或顯示在畫面上
      } else {
        toast.error("資料保存失敗");
        console.log("保存失敗!回應狀態碼:", response.status);
      }
    } catch (error) {
      console.error("Error uploading data:", error);
      toast.error("資料保存失敗");
      console.log("保存失敗!回應狀態碼:", error);
    }
  };

  const handleFixInfoChange = (e, index) => {
    const { value } = e.target;

    if (value === 0 || undefined || "") {
      return "未填寫資料";
    }
    const newPhotoInfo = [...formData.photoInfo];
    newPhotoInfo[index] = value;
    setFormData({ ...formData, photoInfo: newPhotoInfo });
  };

  const handleSelectOption = (option) => {
    setFormData({ ...formData, name: option.employee_name }); //將選項自動填入
    setOptions([]); // 清空選項
  };

  const EquipmentOptionSelect = (machinestatus) => {
    //判斷設備代碼有無輸入格式錯誤(En+數字)
    if (!regex_repairerr.test(machinestatus)) {
      setIsmachineValid(false);
    } else {
      setIsmachineValid(true);
    }

    setFormData((prevFormData) => ({
      ...prevFormData,
      machine: "", // 重設設備編號加名稱
    }));
    setFormData({ ...formData, machine: machinestatus });
    setFilteredDeviceOptions([]); // 清空設備選項
    setIsDeviceDropdownOpen(false);
  };

  const ErrCodeOptionSelect = (errstatus) => {
    //取errorcode當下輸入狀態有錯誤以下可能
    if (!regex_repairerr.test(errstatus)) {
      setIsErrCodeValid(false);
    } else {
      setIsErrCodeValid(true);
    }

    setFormData((prevFormData) => ({
      ...prevFormData,
      errorcode: "", // 重設設備錯誤碼
    }));
    setFormData({ ...formData, errorcode: errstatus });
    setFilteredErrorOptions([]); // 清空錯誤碼選項
    setIsDropdownOpen(false);
  };

  return (
    <div className="repairRequest">
      <Form onSubmit={handleSubmit}>
        <Form.Group>
          <Form.Label>填表人員:</Form.Label>
          <Form.Control
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="請輸入姓名"
            required
          />
        </Form.Group>
        <ul className="autocomplete-options">
          {options.slice(0, 10).map((option, index) => (
            <li key={index} onClick={() => handleSelectOption(option)}>
              {option.employee_name}
            </li>
          ))}
        </ul>
        <Form.Group>
          <Form.Label>時間:</Form.Label>
          <Form.Control
            name="time"
            type="datetime-local"
            value={formData.time}
            onChange={handleChange}
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>區域:</Form.Label>
          <Form.Select
            name="place"
            value={formData.place}
            onChange={handleChange}
            required
          >
            <option value="1樓負極塗佈區">1樓負極塗佈區</option>
            <option value="1樓正極塗佈區">1樓正極塗佈區</option>
            <option value="1樓分條區">1樓分條區</option>
            <option value="1樓碾壓區">1樓碾壓區</option>
            <option value="1樓出貨區">1樓出貨區</option>
            <option value="1樓模組區">1樓模組區</option>
            <option value="1樓電氣區">1樓電氣區</option>
            <option value="2樓組裝區">2樓組裝區</option>
            <option value="2樓模組區">2樓模組區</option>
            <option value="2樓注液區">2樓注液區</option>
            <option value="2樓電化學區">2樓電化學區</option>
            <option value="2樓混漿區">2樓混漿區</option>
            <option value="3樓研發電化學區">3樓研發電化學區</option>
            <option value="3樓研發手套箱區">3樓研發手套箱區</option>
            <option value="3樓研發工作區">3樓研發工作區</option>
            <option value="3樓落粉區">3樓落粉區</option>
          </Form.Select>
        </Form.Group>
        <Form.Group>
          <Form.Label>故障設備:</Form.Label>
          <span style={{ fontSize: "0.9rem", marginLeft: "0.5rem" }}>
            <a href="#" onClick={openModal}>
              設備清單
            </a>
          </span>
          <Form.Control
            type="text"
            name="machine"
            value={formData.machine}
            onChange={handleChange}
            placeholder="請輸入故障設備名稱+機台編號"
            required
          />
          {isDeviceDropdownOpen && filteredDeviceOptions.length > 0 && (
            <ul className="dropdown-options">
              {filteredDeviceOptions.map((device, index) => (
                <li
                  key={index}
                  onClick={() => EquipmentOptionSelect(device)}
                  className="dropdown-option"
                >
                  {device}
                </li>
              ))}
            </ul>
          )}
        </Form.Group>
        <Form.Group>
          <Form.Label>錯誤代碼:</Form.Label>
          <Form.Control
            type="text"
            name="errorcode"
            value={formData.errorcode}
            onChange={handleChange}
            placeholder="請輸入設備錯誤代碼(英文+數字)"
            required
          />
          {isDropdownOpen && filteredErrorOptions.length > 0 && (
            <ul>
              {filteredErrorOptions.map((option, index) => (
                <li
                  key={index}
                  onClick={() => ErrCodeOptionSelect(option)}
                  className="errcode_option"
                >
                  {option}
                </li>
              ))}
            </ul>
          )}
        </Form.Group>
        <Form.Group>
          <Form.Label>目前狀況:</Form.Label>
          <Form.Select
            name="machineStatus"
            value={formData.machineStatus}
            onChange={handleChange}
          >
            <option value="觀察中">觀察中</option>
            <option value="停機">停機</option>
          </Form.Select>
        </Form.Group>

        <Form.Group>
          <Form.Label>問題敘述:</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            name="question"
            value={formData.question}
            onChange={handleChange}
            placeholder="請敘述故障情形"
            required
          />
        </Form.Group>

        <Form.Group>
          <Form.Label>故障照片:</Form.Label>
          <Form.Control
            type="file"
            name="photo"
            accept=".png, .jpg, .jpeg"
            multiple
            onChange={handleFileChange}
          />
          <div
            style={{
              marginTop: "0.6rem",
            }}
          >
            圖片備註:
          </div>
          {Array.from({ length: fileCount }, (_, i) => (
            <input
              key={i}
              className="textArea"
              onChange={(e) => handleFixInfoChange(e, i)}
            />
          ))}
        </Form.Group>
        <Button variant="primary" type="submit" className="mt-3">
          送出
        </Button>
      </Form>
      {/* Move modal rendering inside the main div */}
      {showModal && (
        <FixPopform
          FormMachineList={mechanical_device}
          side={"Repair"}
          closeModal={closeModal}
        />
      )}
    </div>
  );
};

export default RepairRequest;
