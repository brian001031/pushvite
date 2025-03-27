import React, { useState, useEffect, useRef } from "react";
import config from "../../config";
import { Form, Button } from "react-bootstrap";
import axios from "axios";
import dayjs from "dayjs";
import Table from "react-bootstrap/Table";
import "./index_popform.scss";

const Popform = ({ FormRawtable, RadioValue, closeModal }) => {
  const [pursaleinvencolumn, view_pursaleinvencolumn] = useState([]);
  const [pursaleinvenItems, view_pursaleinvenItems] = useState([]);
  const [filenameList, setFileNameList] = useState([{ queryfile: "" }]);
  const [visibleRows, setVisibleRows] = useState(20); // Initially show 20 rows
  const [exist_ID, have_exist_ID] = useState(false); // 布林判斷是否有column ID
  const [PFCC1andCC2, setPFCC1andCC2] = useState(false); // 布林判斷是否切換到 PF或CC1andCC2 mergy table

  const [popvalues, setpopValues] = useState({
    ID_head: "",
    ID_end: "",
  });

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setpopValues({
      ...popvalues,
      [name]: value,
    });
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

  const handleFileChange = (e, index) => {
    const { name, value } = e.target;
    const list = [...filenameList];
    list[index][name] = value;
    setFileNameList(list);
  };

  const handleFileRemove = (index) => {
    const list = [...filenameList];
    list.splice(index, 1);
    setFileNameList(list);
  };

  const handleFileAdd = () => {
    setFileNameList([...filenameList, { queryfile: "" }]);
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    // console.log("Form Data Submitted:", FormRawtable);
    //清空flag
    have_exist_ID(false);
    setPFCC1andCC2(false);
    closeModal(); // Close the modal after submission
  };

  useEffect(() => {
    const fetchtable_row = async () => {
      try {
        const response = await axios.get(
          // `${config.apiBaseUrl}/purchsaleinvtory/view_schematicraw`,
          "http://localhost:3009/purchsaleinvtory/view_schematicraw",
          {
            params: { FormRawtable: FormRawtable, RadioValue: RadioValue },
          }
        );
        console.log(response.data);
        view_pursaleinvencolumn(response.data.colname);
        view_pursaleinvenItems(response.data.rawdata);
      } catch (error) {
        console.error("取得資料錯誤", error);
      }
    };

    fetchtable_row();
  }, []);

  useEffect(() => {
    // console.log("總鍵名:", pursaleinvencolumn);
    // console.log("總數據:", pursaleinvenItems);

    //判斷是否有ID欄位
    pursaleinvencolumn.forEach((item) => {
      if (item.COLUMN_NAME === "ID" || item.COLUMN_NAME === "id") {
        have_exist_ID(true);
      }
    });

    // 判斷目前tablename 是否為PF或CC1andCC2
    if (
      FormRawtable === "testmerge_pf" ||
      FormRawtable === "testmerge_cc1orcc2"
    ) {
      setPFCC1andCC2(true); // 切換到PF或CC1andCC2
    }
  }, [pursaleinvenItems, pursaleinvencolumn]);

  return (
    <div className="popform_display">
      <form onSubmit={handleSubmit}>
        <div className="modal-overlay">
          <div className="modal-container">
            <div style={{ display: "flex", justifyContent: "center" }}>
              <h3 style={{ justifycontent: "center", marginRight: "1000px" }}>
                {FormRawtable} 當前資料數據▼
              </h3>
              <br />
              <button type="submit" className="csv-btn">
                確認產出csv
              </button>
              <button
                type="button"
                style={{ marginLeft: "200px", backgroundColor: "red" }}
                onClick={closeModal}
              >
                取消
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
              <Table
                style={{
                  textAlign: "center",
                  verticalAlign: "middle",
                  width: "100%",
                }}
                striped
                bordered
                hover
              >
                <thead>
                  <tr>
                    {pursaleinvencolumn.map((col, index) => (
                      <th key={index}>{col.COLUMN_NAME}</th>
                    ))}
                  </tr>
                </thead>
              </Table>

              <div
                style={{
                  maxHeight: "1000px",
                  overflowY: "auto",
                  display: "block",
                  width: "100%", // Optional, set width if needed
                }}
                onScroll={handleScroll} // Scroll event handler
              >
                <Table
                  style={{
                    textAlign: "center",
                    verticalAlign: "middle",
                    width: "100%",
                  }}
                  striped
                  bordered
                  hover
                >
                  <tbody
                    style={{
                      maxHeight: "300px",
                      overflowY: "auto",
                      flexDirection: "column",
                    }}
                    onScroll={handleScroll}
                  >
                    {pursaleinvenItems
                      .slice(0, visibleRows)
                      .map((item, rowIndex) => (
                        <tr key={rowIndex}>
                          {pursaleinvencolumn.map((col, colIndex) => (
                            <td key={colIndex}>{item[col.COLUMN_NAME]}</td> // Use COLUMN_NAME to access item values
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </div>
            </div>

            {exist_ID && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "5px",
                  justifyContent: "center",
                }}
              >
                <label>ID:</label>
                <input
                  type="text"
                  name="ID_head"
                  value={popvalues.ID_head}
                  onChange={handleChange}
                  placeholder="輸入數字(首筆)"
                  style={{ marginLeft: "5px", maxWidth: "115px" }}
                />
                <br />
                <label>ID:</label>
                <input
                  type="text"
                  name="ID_end"
                  value={popvalues.ID_end}
                  onChange={handleChange}
                  placeholder="輸入數字(截止)"
                  style={{ marginLeft: "5px", maxWidth: "115px" }}
                />
              </div>
            )}
            <br />
            <br />
            {PFCC1andCC2 && (
              <div>
                <label>使用CSV分析原數據</label>
                <div className="file-entry-container">
                  {filenameList.map((singlequeryfile, index) => (
                    <div key={index} className="file-entry">
                      <div className="file-input">
                        <input
                          name="queryfile"
                          type="text"
                          id="queryfile"
                          value={singlequeryfile.queryfile}
                          onChange={(e) => handleFileChange(e, index)}
                          required
                        />
                        {filenameList.length - 1 === index &&
                          filenameList.length < 14 && (
                            <button
                              type="button"
                              name="addbtn"
                              onClick={handleFileAdd}
                              className="add-btn"
                            >
                              <span>增加</span>
                            </button>
                          )}
                      </div>
                      <div className="remove-btn-container">
                        {filenameList.length !== 1 && (
                          <button
                            type="button"
                            onClick={() => handleFileRemove(index)}
                            className="remove-btn"
                          >
                            <span>移除</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default Popform;
