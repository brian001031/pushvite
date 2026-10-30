import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import config from "../../config";
import "./index.scss";
import { Form, Modal, Button, Image, Card, Row, Col, Table, FormControl, Toast  } from 'react-bootstrap';
import dayjs from "dayjs";
import { toast } from "react-toastify";
import PhotoCarousel from "../../components/PhotoCarousel";
import Photo_FlexTemplate from "../../components/ImageFlexDisplay";
import {
  FaFilePdf,
  FaFileWord,
  FaFileExcel,
  FaFileImage,
} from "react-icons/fa";


//初始化空數據組
const empty_edit_info = {
    ch_name: '', // 中文耗材名(Ch)
    consumables_name: '',  //耗材名稱(英文)
    brand: '',  // 廠牌
    spec: '',    // 規格  
    summary: '', //數量
};

const Consumables_ErrorList = [
    {
      field: "detector_null",
      message: "有偵測到耗材欄位空值"
    }
    ,
    {
        field: "qty_low1",
        message: "耗材數量小於1或空"
    },
    {
        field: "ch_name",
        message: "中文名稱格式錯誤"
    },
    {
        field: "eng_name",
        message: "英文名稱格式錯誤"
    },
    {
        field: "vender_name",
        message: "廠商名稱錯誤"
    },
    {
        field: "spec_style",
        message: "型號規格樣式錯誤"
    }
];

const regexChinese = /^[\u4E00-\u9FFF]+$/; // 中文名稱
const regexEnglish = /^[A-Za-z\s]+$/;      // 英文名稱（可有空白）
const regex_SpecType = /^[A-Za-z0-9_-]+$/; // 型號規格（英文、數字、-、_）
const regexVendor = /^[A-Za-z0-9\u4E00-\u9FFF\s()（）-]+$/; //// 廠商名稱（中文、英文、數字、空白、()、-


/* ---------------- 維修耗材資訊 CardItem 元件 ---------------- */
const CardItem = ({ data }) => (
  <div
    style={{  
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
    <div style={{fontSize:"20px"}}><span style={{fontSize:"20px" , background:"hsla(60, 24%, 93%, 0.93)" }}> 中文名:  </span><b>{data.chbig5_name}</b></div>
    <div style={{fontSize:"20px"}}><span style={{fontSize:"20px" , background:"hsla(60, 30%, 92%, 0.93)" }}> 英文名: </span><b>{data.eng_name}</b></div>
    <div style={{fontSize:"20px"}}><span style={{fontSize:"20px" , background:"hsla(60, 30%, 92%, 0.93)" }}> 廠商名稱: </span> <b>{data.sourser_vender}</b></div> 
    <div style={{fontSize:"20px"}}><span style={{fontSize:"20px" , background:"hsla(60, 30%, 92%, 0.93)" }}> 型號規格: </span> <b>{data.spec_type}</b></div>
    <div style={{fontSize:"20px"}}><span style={{fontSize:"20px" , background:"hsla(60, 30%, 92%, 0.93)" }}> 數量:</span> <b>{data.total_qty}</b></div>
  </div>
);


const RepairEdit = () => {
  const { id } = useParams();
  const [formData, setFormData] = useState(null);
  const [isOverLimit, setOverLimit] = useState(false); // 初始化表單數據為空
  const [totalMB, setTotalMB] = useState(0); // 用於顯示上傳的檔案總大小
  //姓名的下拉選項
  const [options, setOptions] = useState([]);
  // 儲存多筆類別維修耗材資料
//  const [consumablesrows, setConsumablesRows] = useState([ { ...empty_edit_info } ]); 
  const [consumablesrows, setConsumablesRows] = useState([]); 
  //紀錄有錯誤的輸入資訊內容
  const [consumble_Errors, setConsumble_Errors] = useState({});

  //更新欄位
  const updateEditRow = (index, key, value) => {
  setConsumablesRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

    // 新增空白列（限制一次只新增一筆）
  const addEditRow = () => {             
      setConsumablesRows(prev => [...prev, { ...empty_edit_info }]);
  };

  // 刪除指定列
  const removeEditRow = (index) => {
      setConsumablesRows(prev => 
          prev.filter((_, i) => i !== index)
      );
  };

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === "repair_person") {
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
  };

  //照片部分
  const allowedExtensions = [
    "png",
    "jpg",
    "jpeg",
    "bmp",
    "webp",
    "pdf",
    "doc",
    "docx",
    "xlsx",
    "xls",
  ]; // 允許的檔案副檔名

  //最多檔案上傳大小限制
  const maxTotalSize = 15 * 1024 * 1024; // 15MB

  const getFileIcon = (fileName) => {
    const ext = fileName.split(".").pop().toLowerCase();
    if (ext === "pdf") return <FaFilePdf style={{ color: "red" }} />;
    if (ext === "doc" || ext === "docx")
      return <FaFileWord style={{ color: "blue" }} />;
    if (ext === "xlsx") return <FaFileExcel style={{ color: "green" }} />;
    if (
      allowedExtensions.includes(ext) ||
      (ext !== "pdf" && ext !== "doc" && ext !== "docx" && ext !== "xlsx")
    ) {
      return <FaFileImage style={{ color: "orange" }} />;
    }
    return null;
  };

  const consumables_info_submit  = (allrows)  => {

   return (Array.isArray(allrows) && allrows.length > 0) ? 
       allrows.map((row, index) => ({
                rowIndex: index + 1,
                chbig5_name: row?.ch_name ?? "",
                eng_name: row?.consumables_name ?? "",
                sourser_vender: row?.brand?? "",
                spec_type: row?.spec?? "",
                total_qty: Number(row?.summary) || parseInt(1),           
            }))
    :[];

  };

  	const checkConsumablesUp_struct = (rows) => {
        const map = new Map();
        const errors = {};

        rows.forEach((row, index) => {
            const ch_name = row.ch_name?.trim();
            const eg_name = row.consumables_name?.trim();
			      const brand = row.brand?.trim();
            const spec_type = row.spec?.trim();
            const qty =  Number(row.summary ?? 0); 
          
            const hasQty = qty !== undefined && qty !== null && String(qty).trim() !== '';
            const has_ch5_encode = ch_name !== undefined && ch_name !== null && String(ch_name).trim() !== '';
            const has_eng_encode = eg_name !== undefined && eg_name !== null && String(eg_name).trim() !== '';
            const has_brand = brand !== undefined && brand !== null && String(brand).trim() !== ''; 
            const has_spec_stand = spec_type !== undefined && spec_type !== null && String(spec_type).trim() !== '';  
             
             

            // qty = 0 狀態錯誤記錄
            if (hasQty) {
                if (qty <= 0) {
                    errors[index] = {
                        ...(errors[index] || {}),
                        qty_low1: true
                    };
                }
            }

         //判斷中文 英文 廠牌 規格 有無空
          if ( !has_ch5_encode || !has_eng_encode ||  !has_brand ||  !has_spec_stand) {
                errors[index] = {
                    ...(errors[index] || {}),
                    detector_null: true
                };
          }else{
              //下列再依序判斷字型與結構
              if(has_ch5_encode &&  !regexChinese.test(ch_name) ){
                    errors[index] = {
                        ...errors[index],
                        ch_name: true
                    };
              }

              if(has_eng_encode  && !regexEnglish.test(eg_name) ){
                  errors[index] = {
                        ...errors[index],
                        eng_name: true
                  };
              }

              if(has_brand  && !regexVendor.test(brand) ){
                  errors[index] = {
                        ...errors[index],
                        vender_name: true
                  };
              }

              if(has_spec_stand  && !regex_SpecType.test(spec_type) ){
                  errors[index] = {
                        ...errors[index],
                         spec_style: true
                  };
              }
          }
          
        });

      //將有異常的錯誤訊息存入
      setConsumble_Errors(errors);
  };

  const getErrorRows = (field) =>
    Object.entries(consumble_Errors)
        .filter(([_, err]) => err[field])
        .map(([index]) => Number(index) + 1);

  const handleFileChange = (e) => {
    const files = e.target.files;
    let newImages_documents = [];
    let totalSize = 0;
    setOverLimit(false); // 初始化為未超過限制
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const single_size = file.size;
      const fileExtension = file.name.split(".").pop().toLowerCase();
      if (
        !allowedExtensions.includes(fileExtension) ||
        newImages_documents.length > 10
      ) {
        // 如果檔案副檔名不在允許的清單中，或者已經有十份檔案(圖片或文件)，拒絕上傳
        console.log("拒絕上傳：", fileExtension);
      } else {
        console.log("允許上傳：", file.name);
        newImages_documents.push(file);
      }

      totalSize += single_size; // 累加檔案大小

      if (totalSize > maxTotalSize) {
        //toast.error("上傳失敗，檔案總大小超過 15MB 限制");
        setOverLimit(true);
        // console.log("上傳失敗，檔案總大小超過 15MB 限制");
        // newImages_documents = []; // 清空新圖片陣列
        //e.target.value = ""; // 清空選擇的檔案
        // return; // 如果超過限制，停止處理
      }
    }
    const cal_totalMB = totalSize / (1024 * 1024);
    setTotalMB(cal_totalMB.toFixed(2)); // 更新總大小狀態

    // 更新 formData 中的圖片陣列
    setFormData({ ...formData, photos_doc: newImages_documents });
  };
  // const handleSubmit = async (e) => {
  //   e.preventDefault();
  //   console.log(formData);
  // };
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log(formData);

    if (isOverLimit) {
      toast.error("上傳失敗，檔案總大小超過 15MB 限制");
      return;
    }

    if(Object.values(consumble_Errors).length > 0)  {

       for (const item of Consumables_ErrorList) {

				const error_rows = getErrorRows(item.field);

				if (error_rows.length) {

					toast.error(
						!item.field.includes("detector_null")?`第 ${error_rows.join("、")} 筆${item.message}`:`${item.message}`
					);				
          return;
				}
			}
         

    }

    //新增耗材資訊列表
    const all_consumables = consumables_info_submit (consumablesrows);
   // console.log("耗材量異常偵測數量為:"+ Object.values(consumble_Errors).length);

    // 創建 FormData 對象，用於將表單數據發送到後端
    const formDataToSend = new FormData();
    formDataToSend.append("machine", formData.machine);
    formDataToSend.append("handled", formData.handled);
    formDataToSend.append("repair_person", formData.repair_person);
    formDataToSend.append("handling_method", formData.handling_method);
    formDataToSend.append("confirmation_method", formData.confirmation_method);
    formDataToSend.append("reoperation_time", formData.reoperation_time);
    formDataToSend.append("consumables_info_all", JSON.stringify(all_consumables,null,2)); // 2026.07.14 耗材維修列表新增
    
    if (formData.photos_doc && formData.photos_doc.length > 0) {
      formData.photos_doc.forEach((photo_doc) => {
        formDataToSend.append("photos_doc", photo_doc);
      });
    }

    // console.log("事先確認formDataToSend▽");
    // for (const [key, value] of formDataToSend.entries()) {
    //   console.log(key, value);
    // }


    try {
      // 使用 axios.patch 方法將表單數據發送到後端進行更新
      const response = await axios.patch(
        `${config.apiBaseUrl}/repair/repair_list/${id}`,
     //   `http://localhost:3009/repair/repair_list/${id}`,
        formDataToSend,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      // 檢查 response 的狀態碼，如果狀態碼為 201，表示更新成功
      if (response.status === 200) {
        toast.success("資料保存成功");
        console.log("資料保存成功");
        window.location.reload();
        // 這裡可以加上顯示成功訊息的邏輯，例如彈出提示框或顯示在畫面上
      } else {
        toast.error("資料保存失敗");
        console.log("保存失敗!回應狀態碼:", response.status);
      }
    } catch (error) {
      console.error("Error uploading data:", error);
      toast.error("資料保存失敗");
     

      if (error.response) {
        console.log("HTTP Status:", error.response.status);
        console.log("Response:", error.response.data);
      } else if (error.request) {
        console.log("Request 已送出，但沒有收到回應");
      } else {
        console.log("Axios Error:", error.message);
      }
    }
  };

  const handleSelectOption = (option) => {
    setFormData({ ...formData, repair_person: option.employee_name }); //將選項自動填入
    setOptions([]); // 清空選項
  };

  useEffect(() => {
        checkConsumablesUp_struct(consumablesrows);
  }, [consumablesrows]);

  useEffect(() => {
    const fetchRepairItem = async () => {
      try {
        const response = await axios.get(
          `${config.apiBaseUrl}/repair/repair_list/${id}`,
       //   `http://localhost:3009/repair/repair_list/${id}`,
        );
        const data = response.data[0];
        if (!data.reoperation_time) {
          // 如果 reoperation_time 為 null，則設置為當前時間
          data.reoperation_time = dayjs().format("YYYY-MM-DDTHH:mm");
        }
        console.log(`取得序號:${id}-repair內容為:`+ JSON.stringify(data,null,2));
        setFormData(data);
      } catch (error) {
        console.error("取得資料錯誤", error);
      }
    };

    fetchRepairItem();
  }, [id]);
  return (
    <>
      {formData && (
        <Form onSubmit={handleSubmit}>
          <Card style={{ marginBottom: "10px", backgroundColor: "#DDD" }}>
            <Card.Body>
              <Card.Title>故障問題</Card.Title>
              <div>
                <Form.Group>
                  <Form.Label>報修人員:</Form.Label>
                  <Form.Control
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="報修人員"
                    disabled
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label>報修時間:</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    value={dayjs(formData.time).format("YYYY-MM-DDTHH:mm")}
                    onChange={handleChange}
                    disabled
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label>區域:</Form.Label>
                  <Form.Control
                    type="text"
                    name="place"
                    value={formData.place}
                    onChange={handleChange}
                    placeholder="區域"
                    disabled
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label>故障設備(編號):</Form.Label>
                  <Form.Control
                    type="text"
                    name="machine"
                    value={formData.machine}
                    onChange={handleChange}
                    placeholder="請輸入故障設備名稱+機台編號"
                    required
                  />
                  {formData.photo_path && formData.photo_path.length === 1 ? (
                    <Image
                      src={`${config.apiBaseUrl}/uploads/${formData.photo_path[0]}`}
                  //    src={`http://localhost:3009/uploads/${formData.photo_path[0]}`}
                      style={{ maxWidth: "300px", height: "auto" }}
                      className="mt-3"
                      alt="single-photo"
                    />
                  ) : formData.photo_path && formData.photo_path.length > 1 ? (
                    // eslint-disable-next-line react/jsx-pascal-case
                    <Photo_FlexTemplate photoPaths={formData.photo_path} />
                  ) : (
                    <></>
                  )}
                </Form.Group>
                <Form.Group>
                  <Form.Label>錯誤代碼:</Form.Label>
                  <Form.Control
                    type="text"
                    name="errorcode"
                    value={formData.errorcode}
                    onChange={handleChange}
                    required
                  />
                </Form.Group>
                  {/*這邊加入耗材維修列表清單*/}
                <Form.Group>
                  <Form.Label>耗材維修列表清單:</Form.Label>
                    {/* 耗材清單卡片區 */}
                    <div
                      style={{
                        display: "flex",
                        gap: "15px",
                        alignItems: "center",          
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "15px",
                          flexWrap: "wrap"  // <- 允許換行
                        }}
                      >
                        { (formData.consumables_info ||[]).map((item, index) => (
                          <div
                              key={index}
                              style={{
                                // flex: "0 0 calc((150% - 70px)/6)"  // 6 張/行，60px 是間距 15*4
                                // gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                                gridTemplateColumns: "repeat(6, minmax(120px, 1fr))", // 一行固定 6 張
                                gap: "15px"
                              }}
                          >
                              <CardItem key={index} data={item} />
                          </div>
                        ))}
                      </div> 
                    </div>

                  </Form.Group>
                <Form.Group>
                  <Form.Label>目前狀況:</Form.Label>
                  <Form.Select
                    name="machineStatus"
                    value={formData.machineStatus}
                    onChange={handleChange}
                    disabled
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
                    disabled
                  />
                </Form.Group>
              </div>
            </Card.Body>
          </Card>
          <Card className="repairEdit">
            <Card.Body>
              <Card.Title>修復回報</Card.Title>
              <div>
                <Form.Group>
                  <Form.Label>維修人:</Form.Label>
                  <Form.Control
                    type="text"
                    name="repair_person"
                    value={formData.repair_person || ""}
                    onChange={handleChange}
                    placeholder="維修人姓名"
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
                <div>
                <Form.Label style={{paddingTop:"10px"}}>維修明細表:</Form.Label>
                <Card style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)'}}>
                <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => addEditRow()}
                    style={{ width: "100%", margin: '1rem 2rem 1rem 2rem', transform: "translateX(-31px)" }}
                >
                    新增維修耗材明細
                </Button>				
                <Card.Body  style={{ overflow:'scroll' , height:'40vh' ,  overflowX: "auto", overflowY: "auto"}}>                        
                      <Table  bordered
                              hover
                              style={{
                                  minWidth: "1200px",
                                  width: "100%"
                              }}
                       >
                          <colgroup>
                              <col style={{ width: '18%' }} />
                              <col style={{ width: '18%' }} />
                              <col style={{ width: '18%' }} />
                              <col style={{ width: '18%' }} />
                              <col style={{ width: '18%' }} />
                              <col style={{ width: '10%' }} />
                          </colgroup>
                          <thead>
                              <tr>
                                  <th>中文品名(Ch_Name)</th>
                                  <th>英文品名(Eng_Name)</th>
                                  <th>廠牌(Brand)</th>
                                  <th>規格(Spec)</th>                                      
                                  <th>數量(Qty)</th>
                              </tr>
                          </thead>
                           <tbody>
                             {(consumablesrows || []).map((item ,index) => (
                                        <React.Fragment key={index}>
                                          <tr
                                             
                                            >
                                                <td>
                                                    <Form.Control
                                                        type ="text"                                                    
                                                        value={item.ch_name?? ''}
                                                        placeholder='輸入中文品名'                                                   
                                                        onChange={e => updateEditRow(index, 'ch_name', e.target.value)}
                                                    />                                             
                                                </td>
                                                <td>
                                                    <Form.Control
                                                        type ="text"                                                    
                                                        value={item.consumables_name?? ''}
                                                        placeholder='輸入英文品名'                                                   
                                                        onChange={e => updateEditRow(index, 'consumables_name', e.target.value)}
                                                    />                                             
                                                </td>
                                                <td>
                                                    <Form.Control
                                                        type ="text"                                                    
                                                        value={item.brand?? ''}
                                                        placeholder='輸入廠牌名稱'                                                   
                                                        onChange={e => updateEditRow(index, 'brand', e.target.value)}
                                                    />                                             
                                                </td>
                                                <td>
                                                    <Form.Control
                                                        type ="text"                                                    
                                                        value={item.spec?? ''}
                                                        placeholder='輸入規格型號'                                                   
                                                        onChange={e => updateEditRow(index, 'spec', e.target.value)}
                                                    />                                             
                                                </td>
                                                <td 
                                                     style={{
                                                        border: consumble_Errors[index]?.qty_low1 ? '2px solid red' : '1px solid transparent',
                                                    }}
                                                 >
                                                    <Form.Control
                                                        type="number"                                                    
                                                        value={item.summary !== undefined && item.summary !== '' ? Number(item.summary).toFixed(2) : ''}                                                                                                       
                                                        onChange={e => {
                                                            const value = e.target.value;
                                                            updateEditRow(index, 'summary', value === '' ? '' : parseFloat(parseFloat(value).toFixed(2)));
                                                        }}
                                                        min={1}                                                  
                                                    />
                                                </td>
                                                <td className="d-flex gap-1">
                                                    {(
                                                        <Button
                                                            variant="outline-danger"
                                                            size="sm"
                                                            onClick={() => removeEditRow(index)}
                                                        >
                                                            刪除
                                                        </Button>
                                                    )}
                                                </td>                            
                                            </tr>
                                          </React.Fragment>
                                        ))}
                                        {(consumablesrows.length === 0) && (
                                            <tr>
                                                <td  colSpan={6}
                                                  style={{
                                                      textAlign: "center",
                                                      padding: "40px",
                                                      color: "#6c757d",
                                                      fontSize: "1.1rem"
                                                  }}>
                                                    尚無維修耗材資料，請點擊上方「新增一筆耗材資訊」按鈕
                                                </td>
                                            </tr>
                                                
                                       )}
                        </tbody>
                    </Table>
                  </Card.Body>
                 </Card>                 
                </div>              
                <Form.Group>
                  <Form.Label>處理方式:</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={9}
                    name="handling_method"
                    value={formData.handling_method || ""}
                    onChange={handleChange}
                    placeholder="處理方式"
                    required
                  />
                </Form.Group>
                <br />
                <Form.Group>
                  <Form.Label>修復確認方式:</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={9}
                    name="confirmation_method"
                    value={formData.confirmation_method || ""}
                    onChange={handleChange}
                    placeholder="確認方法"
                    required
                  />
                </Form.Group>
                <br />
                <Form.Group>
                  <Form.Label>修復結果</Form.Label>
                  <Form.Select
                    name="handled"
                    value={formData.handled}
                    onChange={handleChange}
                  >
                    <option value="0">未修復</option>
                    <option value="2">觀察中</option>
                    <option value="1">已修復</option>
                  </Form.Select>
                </Form.Group>
                <br />
                <Form.Group>
                  <Form.Label>再作業時間:</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    name="reoperation_time"
                    value={dayjs(formData.reoperation_time).format(
                      "YYYY-MM-DDTHH:mm"
                    )}
                    onChange={handleChange}
                    required
                  />
                </Form.Group>
                <Form.Group>
                  <Form.Label>修復照片/報告檔案:</Form.Label>
                  <Form.Control
                    type="file"
                    name="photo"
                    accept=".png, .jpg, .jpeg ,.bmp ,.pdf, .doc, .docx, .xlsx, .xls"
                    multiple
                    onChange={handleFileChange}
                  />
                  {formData.photos_doc && formData.photos_doc.length > 0 && (
                    <div className="mt-3">
                      <h5>選擇上傳文件:</h5>
                      <ul>
                        {formData.photos_doc.map((file, idx) => (
                          <li key={idx}>
                            {getFileIcon(file.name)} {file.name} (
                            {(file.size / 1024).toFixed(2)} KB)
                          </li>
                        ))}
                      </ul>
                      <p style={{ fontWeight: "bold" }}>
                        總檔案大小：{totalMB} MB（
                        <span style={{ color: isOverLimit ? "red" : "green" }}>
                          {isOverLimit ? "已超過限制 15MB" : "可上傳"}
                        </span>
                        ）
                      </p>
                    </div>
                  )}
                </Form.Group>
                {formData.repair_photo && formData.repair_photo.length === 1 ? (
                  <Image
                    src={`${config.apiBaseUrl}/uploads/${formData.repair_photo[0]}`}
              //    src={`http://localhost:3009/uploads/${formData.repair_photo[0]}`}
                    style={{ maxWidth: "300px", height: "auto" }}
                    className="mt-3"
                    alt="single-photo"
                  />
                ) : formData.repair_photo &&
                  formData.repair_photo.length > 1 ? (
                  // <PhotoCarousel photoPaths={formData.repair_photo} />
                  // eslint-disable-next-line react/jsx-pascal-case
                  <Photo_FlexTemplate photoPaths={formData.repair_photo} />
                ) : (
                  <></>
                )}
              </div>
            </Card.Body>
          </Card>          
          {/* 上面都是故報回報!!!!!!!!!!! */}

          <Button variant="primary" type="submit" className="mt-3">
            送出
          </Button>
        </Form>
      )}
    </>
  );
};

export default RepairEdit;
