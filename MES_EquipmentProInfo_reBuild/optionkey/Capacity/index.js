
import React from 'react';
import MESEquipmentProInfoRebuild from '../..'; 
import { FormattedMessage, IntlProvider, FormattedDate } from "react-intl";
import { Row, Col, Button, FormGroup, Label, Input, Toast , Card , Form} from "reactstrap";
import '../../styles.scss'; 


const Capacity = () => {
    const [inputValue, setInputValue] = React.useState("");
        const [machineoption , setMachineoption] = React.useState("")
               
    const handleSelectChange = (e) => {
        setInputValue(e.target.value);
        setMachineoption(String(e.target.value).trim());
    };

    
    
    return (
        <div>
            <MESEquipmentProInfoRebuild/>
             <select
                        id="type"
                        value={inputValue}
                        onChange={handleSelectChange}
                        style={{
                            width: "100%",
                            height: "40px",
                            fontSize: "16px",
                            padding: "10px",
                            border: "1px solid #ccc",
                            marginBottom: "1vh"
                        }}
                    >
                        <option value="">請選擇</option>
                        <option value="CC1-分容機一期">CC1-分容機一期</option>
                        <option value="CC1-分容機二期">CC1-分容機二期</option>
                        <option value="CC2-分容機一期">CC2-分容機一期</option>
                        <option value="CC2-分容機二期">CC2-分容機二期</option>
                    </select>
           <Row>
                <Col lg={12} md={12} sm={12} >
                   
                </Col>
              
            </Row>

            <Row className="EdgeFoldingRow">
                <Col lg={3} md={3} sm={12} >
                    <div className = "LeftContent">
                        <div className='Content_Top'>
                            <div className='Title'>生產資訊標籤</div>
                            <div className='Content'>●設備編號: </div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●目前狀態: </div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●目前生產人員: </div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●目前工單號: </div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●目前產能: </div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●班別 </div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●生產日期: </div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●生產量</div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●累積產能</div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●設備維護員</div>
                            <div className='Answer'>回答</div>
                            <div className='Content'>●語言切換:</div>
                        </div>
                    </div>
                </Col>
                <Col lg={5} md={5} sm={12} >
                    <div className = "MiddleContent">
                        <div className='Content_Top'>
                            <div className='Title_Middle'>設備生產參數</div>
                            <div className='ContainerCentter'>

                                <div className='Content_Middle'>設備參數更新約 </div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "60%", boxSizing: "inlineBlock" }}>
                                    <div className='Answer_Middle'>
                                        10
                                    </div>
                                </div>
                                <div className='Content_Middle'>秒鐘</div>
                                
                            </div>
                            <div>
                                <div>
                                    這裡抓資料
                                </div>
                            </div>
                        </div>
                    </div>
                </Col>
                <Col lg={4} md={4} sm={12} >
                    <div className = "RightContent">
                        <div className='Content_Top'>
                            <div className='Title' style={{backgroundColor : "#f0f0f0",color: "black",}}>1.短期目標:</div>
                            <textarea style={{ border : "1px solid #ccc", width: "100%", height: "30vh", overflow: "scroll",}}></textarea>
                            <div className='Title' style={{backgroundColor : "#f0f0f0",color: "black",}}>2.長期目標:</div>  
                            <textarea style={{ border : "1px solid #ccc", width: "100%", height: "30vh", overflow: "scroll",}}></textarea> 
                        </div>
                        <div className='Title' style={{ width: "100%", display: "flex" , flexDirection : "column"}}>細節分頁進入:</div>
                        <div className='ButtonGroup' style={{ display: "flex" , display: "flex" , flexDirection : "column"}}>
                            <button className="BtnChange" style={{backgroundColor: "#ff5809"}}>例行性保養介面</button>
                            <button className="BtnChange" style={{backgroundColor: "#8ec0c0"}}>耗材更換紀錄</button>
                             <button className="BtnChange" style={{backgroundColor: "#82d900"}}>檢點表</button>
                            <button className="BtnChange" style={{backgroundColor: "#cc2200",}}>異常紀錄</button>
                           <button className="BtnChange" style={{ backgroundColor: "#0b565f"}}>SOP、SIP、教學影片</button>  
                        </div>
                    </div>
                </Col>
            </Row>
        </div>
    );
}; 

export default Capacity;
