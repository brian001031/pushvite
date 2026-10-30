import "./index.scss";
import React, { useState, useEffect, useRef, useMemo, Suspense, useCallback } from "react";
import axios from "axios";
import Form from "react-bootstrap/Form";
import Dropdown from "react-bootstrap/Dropdown";
// eslint-disable-next-line no-unused-vars
import config from "../../config";
import * as echarts from "echarts/core";
import { ClipLoader } from "react-spinners";
import Skeleton from "react-loading-skeleton";
import * as XLSX from "xlsx";
import "react-loading-skeleton/dist/skeleton.css";

import index from "../Home";
import moment from "moment";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/GlobalProvider";

const Purchase_View_status = React.lazy(() => import('../../pages/PurchasingMaterialStatus'));
const TaskboardSearch = React.lazy(() => import("../../pages/TaskboardSearch"));
const PopupAllInfo = React.lazy(() => import("../../pages/MES_EquipmentProInfo_reBuild/PopupAllInfo"));
const FixPopform = React.lazy(() => import("../../components/FixPopform"));
const AddNewMaterial = React.lazy(() => import("./addNewMaterial"));
const StoreControl = React.lazy(() => import('./storeControl'));
const CommanOperator = React.lazy(() => import("./commanOperator/index"));
const ProducingOperator = React.lazy(() => import("./producingOperator/index"));
const TransferAudit = React.lazy(() => import("./producingOperator/transferAudit"));
const TransferAuditList = React.lazy(() => import("./producingOperator/transferAuditList"));
const Electrol = React.lazy(() => import("../ItemTransfer/pages/Electrolyte/index"));

const request_menuItems = [
  { title: "首頁", view: "home", needAuth: false },
  // { title: "物料入倉分配管控", view: "subpage", component: Purchase_View_status, needAuth: true },
  // { title: "通用品領取&退料&調撥", view: "popup", popupKey_modle: CommanOperator, needAuth: true },
  { title: "物料編號管理", view: "popup", popupKey_modle: AddNewMaterial, needAuth: true },
  { title: "倉庫設定", view: "popup", popupKey_modle: StoreControl, needAuth: true },
  { title: "各部門領料&退料&調撥", view: "popup", popupKey_modle: ProducingOperator, needAuth: true },
  { title: "調撥、退料審核", view: "popup", popupKey_modle: TransferAudit, needAuth: true },
  { title: '電解液領取', view: 'popup', popupKey_modle: Electrol, needAuth: false }
  // { title: "調撥、退料審核列表", view: "popup", popupKey_modle: TransferAuditList, needAuth: true }
];


// A~Z
const material_carditems = Array.from(
  { length: 1 },
  (_, i) => ({
    id: i,
    title: String.fromCharCode(65 + i),
    desc: `當前 ${String.fromCharCode(65 + i)} 前綴物料列`
  })
);


//測試空組態
const DeviceList = [];

const ManufactConsumableRequest = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const Material_Popform = React.lazy(() => import("./Material_Popform")); // 物料前綴項目清單  
  const [prefixmaterials, setSelectPrefixMaterials] = useState("");
  const [isOpenQuality, setIsOpenQuality] = React.useState(false);
  const [currentView, setCurrentView] = useState(null);
  const [openPopup, setOpenPopup] = useState(false);
  const [popup_view_modle, setpopup_View_modle] = useState(null);
  const [pupopt_record, setPupoptRecord] = useState("");

  const handleDropdownItemClick = (title) => {
    const item = request_menuItems.find(m => m.title === title);
    if (item) {
      handleMenuClick(item);
    }
  };

  const today = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  });

  // console.log('確認 user inner data : ', user)


  //確認是否已經登入
  const checkPermission = () => {
    if (user === null) {
      toast.warning("無權限訪問此功能，請先登入");
      return false;
    }
    return true;
  };

  const handleMenuClick = (item) => {

    //針對登入狀態卡控(若登出只能訪問 home 首頁)
    if (item.needAuth && !checkPermission()) {
      return;
    }


    if (item.view === "home") {
      setCurrentView(null);
    }
    if (item.view === "subpage") {
      setCurrentView(item.component);
    }

    if (item.view === "popup") {
      OpenPopup_Enable();
      setpopup_View_modle(() => item.popupKey_modle);
      setPupoptRecord(item.title);
    }

  }

  // 點擊事件
  const handleCardClick = (item) => {
    const { title, desc } = item;
    console.log("按下英文字元為:" + title);
    setSelectPrefixMaterials(title);
    handleShow();
  };

  const handleShow = () => {
    setIsOpenQuality(true);
  };
  const handleOnHide = () => {
    setIsOpenQuality(false);
  };


  const OpenPopup_Enable = () => {
    setOpenPopup(true);
  };

  const handlePopupOnHide = () => {
    setOpenPopup(false);
  };

  const PopupViewModle = popup_view_modle;



  return (
    <div className="manufact_consumable_request">
      <div className="container">
        {/* Header */}
        <header className="header">
          <h2
            className="title"
            style={{
              textAlign: "center",
              verticalAlign: "middle",
              fontSize: "50px",
            }}
          >
            ERP物料配給管控
          </h2>

          <div className="marquee-wrapper">
            <div className="marquee">
              📅 今日日期：{today}
            </div>
          </div>

        </header>

        {/* Main Body */}
        <div className="main-content">

          {/* Left Menu */}
          <aside className="sidebar">

            <div className="menu-title">
              功能選單
            </div>

            <ul className="menu-list">
              <li
                className="menu-item"
                onClick={() => handleMenuClick(request_menuItems.find(m => m.title === "首頁"))}
              >
                首頁
              </li>
              {/* <li
                className="menu-item"
                onClick={() => handleMenuClick(request_menuItems.find(m => m.title === "物料入倉分配管控"))}
              >
                物料入倉分配管控
              </li> */}
              <li className="menu-dropdown-item">
                <Dropdown>
                  <Dropdown.Toggle
                    variant="secondary"
                    id="dropdown-stock"
                    className="w-100 text-start menu-dropdown-toggle"
                  >
                    物料與倉庫設定
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="w-100">
                    <Dropdown.Item onClick={() => handleDropdownItemClick("物料編號管理")}>
                      物料編號管理
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => handleDropdownItemClick("倉庫設定")}>
                      倉庫設定
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </li>

              <li className="menu-dropdown-item">
                <Dropdown>
                  <Dropdown.Toggle
                    variant="secondary"
                    id="dropdown-producing"
                    className="w-100 text-start menu-dropdown-toggle"
                  >
                    生產用料領料、退料、調撥
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="w-100">
                    <Dropdown.Item onClick={() => handleDropdownItemClick("各部門領料&退料&調撥")}>
                      各部門領料&退料&調撥
                    </Dropdown.Item>
                    {
                      user?.authStatus === "1" && (
                        <>
                          <Dropdown.Item onClick={() => handleDropdownItemClick("調撥、退料審核")}>
                            調撥、退料審核
                          </Dropdown.Item>
                          {/* <Dropdown.Item onClick={() => handleDropdownItemClick("調撥、退料審核列表")}>
                            調撥、退料審核列表
                          </Dropdown.Item> */}
                        </>
                      )
                    }
                  </Dropdown.Menu>
                </Dropdown>
              </li>

              <li className="menu-dropdown-item">
                <Dropdown>
                  <Dropdown.Toggle
                    variant="secondary"
                    id="dropdown-electrolyte"
                    className="w-100 text-start menu-dropdown-toggle"
                  >
                    電解液領取
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="w-100">
                    <Dropdown.Item onClick={() => handleDropdownItemClick("電解液領取")}>
                      電解液作業
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </li>
              {/* <li
                className="menu-item"
                onClick={() => handleMenuClick(request_menuItems.find(m => m.title === "通用品領取&退料&調撥"))}
              >
                通用品領取&退料&調撥
              </li> */}
            </ul>
          </aside>
          {/* Right Content */}
          <section className="content">
            <h2>物料資訊區塊</h2>
            {
              (currentView && currentView !== null) ? (
                <React.Suspense fallback={<div>Loading載入中...</div>}>
                  {React.createElement(currentView)}
                </React.Suspense>
              ) :
                (
                  <div className="card-grid">
                    {material_carditems.map((item) => (
                      <div
                        key={item.id}
                        className="mini-card"
                        onClick={() => handleCardClick(item)}
                      >
                        <div className="card-title">
                          {item.title}
                        </div>
                        <div className="card-desc">
                          {item.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                )
            }

          </section>
        </div>
        {isOpenQuality === true ? (
          <Suspense fallback={<div>Loading...</div>}>
            <Material_Popform
              show={isOpenQuality}
              onHide={handleOnHide}
              item_prefixkey={prefixmaterials ?? 'A'}
              centered={true}
            />
          </Suspense>
        ) : null}
        {/* 
        {openPopup === true && PopupViewModle? (
           <Suspense fallback={<div>Loading...</div>}>
          {
             <>
             {pupopt_record.includes("生產物料號建構存查更新") &&
               <PopupViewModle
                show={openPopup}
                onHide={handlePopupOnHide}
                centered={true}
                mes_side={{ test: "test" }}
              />          
             }
             {pupopt_record.includes("系統設定") &&
                 <FixPopform
                  FormMachineList={DeviceList}
                  side={"Repair"}
                  closeModal={handlePopupOnHide}
                />
             }:null 
             </>             
          }          
        </Suspense>

      ) : null} */}

        {
          openPopup === true && PopupViewModle ? (
            <Suspense fallback={<div>Loading...</div>}>
              <PopupViewModle
                show={openPopup}
                onHide={handlePopupOnHide}
                centered={true}
              />
            </Suspense>
          ) : null
        }
      </div>
    </div>
  );

}

export default ManufactConsumableRequest;