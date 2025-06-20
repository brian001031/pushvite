import React from "react";
import { Navbar, Nav, Container, Image, Dropdown } from "react-bootstrap";

const NavigationBar = () => {
  return (
    <Navbar bg="primary" data-bs-theme="dark" style={{ whiteSpace: "nowrap" }}>
      <Container>
        {/* 品牌圖片 */}
        <Navbar.Brand href="/Check">
          <Image src="/Cold_Logo_Black.png" alt="Logo" height="30" />
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="me-auto" >
            {/* <Nav.Link href="/Check">打卡</Nav.Link> */}
            <Dropdown>
              {/* <Dropdown.Toggle variant="none" id="dropdown-basic">
                廠務報修
              </Dropdown.Toggle> */}
              <Dropdown.Menu >
                {/* <Dropdown.Item href="/bento">便當</Dropdown.Item>
                <Dropdown.Item href="/bentocount">便當統計</Dropdown.Item> */}
                {/* <Dropdown.Item href="/Check">出勤</Dropdown.Item> */}
                {/* <Dropdown.Item href="/factoryRepairRequest">新增</Dropdown.Item>
                <Dropdown.Item href="/factoryRepairList">查詢</Dropdown.Item> */}
              </Dropdown.Menu>
            </Dropdown>
            {/* <Nav.Link href="/Employees">員工</Nav.Link> */}
            <Dropdown>
              {/* <Dropdown.Toggle variant="none" id="dropdown-basic">
                設備報修
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item href="/repairRequest">新增</Dropdown.Item>
                <Dropdown.Item href="/repairList">查詢</Dropdown.Item>
              </Dropdown.Menu> */}
            </Dropdown>
            <Dropdown>
              <Dropdown.Toggle variant="none" id="dropdown-basic">
                人員作業
              </Dropdown.Toggle>
              <Dropdown.Menu className="">
                <Dropdown.Item href="/taskboard">換班提交</Dropdown.Item>
                <Dropdown.Item href="/TaskboardSearch">換班查詢</Dropdown.Item>
                <Dropdown.Item href="/TaskboardSearch">混漿xxx</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
            {/* <Nav.Link href="/taskboard">工作交接</Nav.Link> */}
            <Dropdown>
              <Dropdown.Toggle variant="none" id="dropdown-basic">
                回收作業
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item href="/classrecyclerequest">新增</Dropdown.Item>
                <Dropdown.Item href="/recyclelist">查詢</Dropdown.Item>
                <Dropdown.Item href="/recyclechart">分析圖表單</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
            {/* <Dropdown>
              <Dropdown.Toggle variant="none" id="dropdown-basic">
                生產設備進行狀態
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item href="/equipmentrecord">查看</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown> */}
            <Dropdown>
              <Dropdown.Toggle variant="none" id="dropdown-basic">
                MES生產資訊
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item href="/mes_equipmentrecord/:optionkey">
                  查閱覽
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
            <Dropdown>
              <Dropdown.Toggle variant="none" id="dropdown-basic">
                進銷存掃碼電化學
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item href="/task_optionmenu">
                  進入選單頁
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
            <Dropdown >
              <Dropdown.Toggle variant="none" id="dropdown-basic">
                人資系統
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item href="/schedule">排班系統</Dropdown.Item>
                <Dropdown.Item href="/attendance">考勤系統</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default NavigationBar;
