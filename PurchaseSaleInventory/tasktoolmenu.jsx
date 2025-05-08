/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useEffect } from "react";
import Table from "react-bootstrap/Table";
import { useNavigate, Form } from "react-router-dom";
import axios from "axios";
import config from "../../config";
import dayjs from "dayjs";
import { Card, Button, Row, Col } from "react-bootstrap";
//成功提示套件
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import "./index_toolmenu.scss";

const TaskToolMenu = () => {
  const [buttonClicked, setButtonClicked] = useState(null);

  // 假設按鈕數量是 6
  const tooloption = [
    {
      id: 1,
      label: "進銷存作業",
      alias: "purch_sales_inventor",
      path: "/purchase_sale_inventory",
    },
    {
      id: 2,
      label: "條碼憑證銷帳作業",
      alias: "scan_qr_writeoff",
      path: "/barcode_linkscan",
    },
    {
      id: 3,
      label: "電化學電芯數據分佈圖",
      alias: "analysis_modle_chart",
      path: "/scatter_schematic_dlg",
    },
    { id: 4, label: "待新增", alias: "", path: "" },
    { id: 5, label: "待新增", alias: "", path: "" },
    { id: 6, label: "待新增", alias: "", path: "" },
    { id: 7, label: "待新增", alias: "", path: "" },
    // { id: 8, label: "待新增", alias: "", path: "" },
    // { id: 9, label: "待新增", alias: "", path: "" },
    // { id: 10, label: "待新增", alias: "", path: "" },
  ];

  const handleClick = (buttonalias) => {
    setButtonClicked(buttonalias);
  };

  //確認進入的tool選單名稱
  useEffect(() => {
    // handleAddinputText();
    if (buttonClicked !== null) {
      switch (buttonClicked) {
        case "purch_sales_inventor":
          break;
        case "scan_qr_writeoff":
          break;
        case "analysis_modle_chart":
          break;

        //後續新增彧此處
        //case "XXX":
        //break;
        default:
          break;
      }
      // 清除或重置 buttonClicked，避免 effect 重複執行
      setButtonClicked(null);
    }
  }, [buttonClicked]);

  const renderdisplay_option = () => {
    // 每3個按鈕一組，分成兩行
    const rows = [];
    let currentRow = [];

    tooloption.forEach((option, index) => {
      currentRow.push(
        <Col md={4} key={option.id} className="mb-3">
          <Link to={option.path}>
            <Button variant="primary" onClick={() => handleClick(option.alias)}>
              {option.label}
            </Button>
          </Link>
        </Col>
      );

      // 每當一行有 3 個按鈕，則結束當前行並開始新的一行
      if ((index + 1) % 3 === 0 || index === tooloption.length - 1) {
        rows.push(
          <div
            style={{
              display: "grid",
              border: "3px solid black",
              textAlign: "center",
              gridTemplateRows: "repeat(6, 10px)",
              paddingTop: "15px",
              background: "#A6FFFF",
            }}
          >
            <Row key={index}>{currentRow}</Row>
          </div>
        );
        currentRow = []; // 重置為空行
      }
    });

    return rows;
  };

  return (
    <div className="tooloptionmenu">
      <div>
        <p className="h1">工作清單</p>
      </div>
      <Card>
        <Card.Body>
          <Card.Header
            className="custom-card-header"
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#FFBB77",
              color: "black",
              textAlign: "center",
              fontSize: " 30px",
              fontStyle: "inherit ",
            }}
          >
            【 選單按鈕 ▼ 】
          </Card.Header>
          <Card.Text></Card.Text>
          {/* 渲染按鈕行 */}
          {renderdisplay_option()}
        </Card.Body>
      </Card>
    </div>
  );
};

export default TaskToolMenu;
