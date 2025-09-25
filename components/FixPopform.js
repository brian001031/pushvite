import React, { useState, useEffect, useCallback, useRef } from "react";
import debounce from "lodash.debounce";
import config from "../config";
import { Form, Button } from "react-bootstrap";
import axios from "axios";
import dayjs from "dayjs";
import Table from "react-bootstrap/Table";
import { Container, Row, Col } from "react-bootstrap";
import "./repair_popform.scss";
//成功提示套件
import { toast } from "react-toastify";

const FixPopform = ({ FormMachineList, side, closeModal }) => {
  const latestQueryRef = useRef(null);
  const [visibleRows, setVisibleRows] = useState(20); // Initially show 20 rows
  const [groupedDevices, setGroupedDevices] = useState({
    一期設備: [],
    二期設備: [],
    模組設備: [],
    廠務設備: [],
  }); // 分組資料

  //確認FileNamelist 狀況
  useEffect(() => {
    if (side !== "Repair" && side !== "Factory") {
      toast.error("站別必須是 'Repair' 或 'Factory'");
      closeModal();
    }

    const grouped = FormMachineList.reduce(
      (acc, item) => {
        const { id, name } = parseDevice(item);
        const group = getBelongGroup(id, side);
        if (!acc[group]) {
          acc[group] = [];
        }
        acc[group].push({ id, name });
        return acc;
      },
      side === "Repair"
        ? {
            一期設備: [],
            二期設備: [],
            模組設備: [],
          }
        : { 廠務設備: [] }
    );

    setGroupedDevices(grouped);
    // console.log("分組後的設備:", grouped);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FormMachineList, side]);

  //解析設備名稱與ID
  const parseDevice = (item) => {
    const [id, ...nameParts] = item.split("-");
    return {
      id,
      name: nameParts.join("-"),
    };
  };

  const toNumber = (str) => parseInt(str.replace("M", ""), 10);

  //一期範圍
  const phase1Start = toNumber("M01097");
  const phase1End = toNumber("M01707");
  const phase1_zero_start = toNumber("M00087");
  const phase1_zero_end = toNumber("M00960");
  //二期範圍
  const phase2Start = toNumber("M02079");
  const phase2End = toNumber("M003371"); // 注意順序不連續但字串仍可轉換

  //模組設備範圍
  const moduleStart = toNumber("M01173");
  const moduleEnd = toNumber("M01180");
  const modulesingle1 = toNumber("M00687");
  const modulesingle2 = toNumber("M01412");

  //判斷是哪一期或模組設備
  const getBelongGroup = (id, side) => {
    //線上設備報修站
    if (side === "Repair") {
      const num = toNumber(id);
      if (
        (num >= moduleStart && num <= moduleEnd) ||
        num === modulesingle1 ||
        num === modulesingle2
      ) {
        return "模組設備";
      } else if (
        (num >= phase1Start && num <= phase1End) ||
        (num >= phase1_zero_start && num <= phase1_zero_end)
      ) {
        return "一期設備";
      } else if (
        (num >= phase2Start && num <= 273000) || // 處理 M02079 ~ M02730
        (num >= 300000 && num <= toNumber("M003371")) // M003370, M003371...
      ) {
        return "二期設備";
      }
    } //廠務設備報修站
    else if (side === "Factory") {
      return "廠務設備";
    }
  };

  const clearViewItems = (event) => {
    // 清空以下儲存內容數據
    // setRowcatch_num(0); // 若需要重設
    // setFirst_ID(0); // 若需要重設
    // setLast_ID(0); // 若需要重設
  };

  const isPositiveInteger = (value) => {
    const num = Number(value);
    return Number.isInteger(num) && num > 0;
  };

  const isLarge_compare_ID = (ST_ID, ED_ID) => {
    const start_ID = Number(ST_ID);
    const end_ID = Number(ED_ID);
    // console.log("比較大小 Start_ID = " + start_ID + " End_ID =  " + end_ID);
    return end_ID >= start_ID;
  };

  useEffect(() => {
    //setVisibleRows(20); // Reset visible rows when modal opens
    console.log(
      "groupedDevices changed:",
      JSON.stringify(groupedDevices, null, 2)
    );
  }, [groupedDevices]);

  const chunkArray = (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };

  const HorizontalDeviceTable = ({ devices, groupSize = 3 }) => {
    const rows = chunkArray(devices, groupSize); // 每行 groupSize 組

    return (
      <Table
        striped
        bordered
        hover
        style={{
          textAlign: "center",
          verticalAlign: "middle",
          width: "100%",
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            {Array.from({ length: groupSize }).map((_, i) => (
              <React.Fragment key={i}>
                <th>財產編號</th>
                <th>設備名稱</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((rowGroup, rowIndex) => (
            <tr key={rowIndex}>
              {rowGroup.map((device, i) => (
                <React.Fragment key={i}>
                  <td>{device.id}</td>
                  <td>{device.name}</td>
                </React.Fragment>
              ))}
              {/* 補足不足的欄位（如果最後一行不足 groupSize） */}
              {Array.from({ length: groupSize - rowGroup.length }).map(
                (_, i) => (
                  <React.Fragment key={`empty-${i}`}>
                    <td></td>
                    <td></td>
                  </React.Fragment>
                )
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  const handleScroll = (e) => {
    // console.log(
    //   e.target.scrollHeight,
    //   e.target.scrollTop,
    //   e.target.clientHeight
    // );

    const bottom =
      e.target.scrollTop + 5 + e.target.clientHeight >= e.target.scrollHeight;

    if (bottom) {
      console.log("Reached the bottom");
      setVisibleRows((prevVisibleRows) => prevVisibleRows + 20); // Load next 20 rows
    }
  };

  const handleCancel = () => {
    closeModal();

    // 重置表單（假設你有使用 useRef 取得 form DOM）
    // formRef.current?.reset();
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();

    closeModal(); // Close the modal after submission
  };

  return (
    <div className="popform_display">
      <form onSubmit={handleSubmit}>
        <div className="modal-overlay">
          <div className="modal-container">
            <div style={{ display: "flex", justifyContent: "center" }}>
              <label
                style={{
                  fontWeight: "bold",
                  fontStyle: "normal",
                  paddingRight: "180px",
                  paddingTop: "20px",
                  fontSize: "41px",
                  // marginInline: "10px",
                }}
              ></label>

              <h3
                style={{
                  // justifycontent: "center",
                  // marginRight: "120px",
                  // paddingTop: "25px",
                  // fontSize: "45px",
                  // fontfamily: "Bungee Spice",
                  // color: "#FFFF00",
                  // backgroundColor: "#0000E3	",
                  marginTop: "35px",
                  marginRight: "120px",
                  paddingTop: "25px",
                  paddingLeft: "12px",
                  fontSize: "41px",
                  fontFamily: "Bungee Spice", // ← 注意這裡要大寫 F
                  color: "#FFFF00",
                  backgroundColor: "#0000E3",
                }}
              >
                當前設備清單▼
              </h3>
              <br />

              <button
                type="button"
                style={{ marginLeft: "100px", backgroundColor: "red" }}
                onClick={handleCancel}
              >
                關閉
              </button>
            </div>
            <div
              style={{
                maxHeight: "1000px",
                overflowY: "auto",
                display: "block",
                width: "100%", // Optional, set width if needed
              }}
            >
              <Container fluid>
                {/* 一期 + 二期：左右欄 */}
                <Row>
                  <Col md={6}>
                    <h4 style={{ marginTop: "20px" }}>📦 一期設備</h4>
                    <HorizontalDeviceTable
                      devices={groupedDevices["一期設備"]}
                      groupSize={3}
                    />
                  </Col>
                  <Col md={6}>
                    <h4 style={{ marginTop: "20px" }}>📦 二期設備</h4>
                    <HorizontalDeviceTable
                      devices={groupedDevices["二期設備"]}
                      groupSize={3}
                    />
                  </Col>
                </Row>

                {/* 模組設備：整排 */}
                <Row style={{ paddingBottom: "550px" }}>
                  <Col>
                    <h4 style={{ marginTop: "40px" }}>🔧 模組設備</h4>
                    <HorizontalDeviceTable
                      devices={groupedDevices["模組設備"]}
                      groupSize={4}
                    />
                  </Col>
                </Row>
              </Container>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default FixPopform;
