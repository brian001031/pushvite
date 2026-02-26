// RoleSelectionModal.js
import React, { useState, useEffect, useCallback, startTransition } from 'react'; // startTransition 轉場 較不造成UI堵塞
import { Modal, Button } from 'react-bootstrap';
import "../style.scss"
import { Suspense } from 'react';
import { useAuth } from '../../../context/GlobalProvider';


const prescription_manerger_all = [
  { id: "003", name: "陳昱昇" },
  { id: "109", name: "黃之奕" },  
  { id: "349", name: "周柏全" },
  { id: "292", name: "張宇翔" }
];


function RoleSelectionModal({ show, onHide, onRoleSelected, centered}) {
  
  const Register = React.lazy(() => import('./Register'));
  const [switchRegister, setSwitchRegister] = useState(false);
  const [operationFormData , setOperationFormData] = useState({
      name: '',
      opNo: '',
      password: '',
  })

  const { user } = useAuth();
  const [prescription_manerger, set_Prescription_Manerger] = useState(false);

  const prescription_Filter_IsAdmin = ( user) => {
        const LoginId = String(user.memberID).padStart(3, "0");      
        const LoginName = String(user.reg_schedulename);

        //只用內碼名稱ID判定ISMANERGER
        return prescription_manerger_all.some(
        (member) => member.id === LoginId && member.name === LoginName
        );
   };


  const handleRoleButtonClick  = useCallback((role)=>  {
    startTransition(() => {
      onRoleSelected(role);
      })
    },[onRoleSelected])

  const handleBack = () => {
    onHide();
  }


  // 註冊頁面開啟關閉 -- start
  const handleRegisterOpen = () => {
    startTransition(() => {
      setSwitchRegister(true);
    });
  }
  const handleRegisterClose = () => {
    startTransition(() => {
      setSwitchRegister(false);
    });
  }


  useEffect(() => {
     //確認登入者身份(是否為配方管理員)
    let userInner ;
     const dataChange = ()=>{
      if (user){
        userInner = user
      }else {
        userInner = {
          id : "",
          name : ""
        }
      }
     }
     dataChange();
    set_Prescription_Manerger(prescription_Filter_IsAdmin(userInner));
  }, []);

  // 註冊頁面開啟關閉 -- end
  
   

  return (
    <Modal show={show} onHide={onHide} backdrop="static" keyboard={false} centered={centered} size='xl'>
      <Modal.Header>
        <Modal.Title style={{
          fontSize: '36px',
          fontWeight: 'bold',
          textAlign: 'center',
          width: '100%',
          display: 'flex',
          justifyContent: 'center'
        }}>登入身分選擇</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className='modal-grid-container'>
          <Button
            className="buttonInnerControl"
            onClick={() => handleRoleButtonClick('engineerLogin')}
          >
            <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                width: "100%"
              }}>
              <div style={{ fontSize: '1.5rem'}}>工程師設定</div>
              <div style={{ fontSize: '1rem'}}>Engineer Login</div>
            </div>
          </Button>
          {prescription_manerger ? (<Button  
            className="buttonInnerControl"
            onClick={()=> handleRoleButtonClick('register')}
            // style={{
            //   visibility: prescription_manerger ? "visible" : "hidden"
            //   }}
            >            
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                width: "100%"
              }}>
                <div style={{fontSize: "1.4rem", textWrap: "nowrap", textAlign: "center"}}>配方紀錄新增</div>
                <div style={{ fontSize: '1rem', textWrap: "wrap", textAlign: "center"}}>Added Recipe Records</div>
              </div>
          </Button>


          ) : null


          }
          
          <Button
             className="buttonInnerControl"
            onClick={() => handleRoleButtonClick('operator')}
          >
            <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                width: "100%"                
              }}>
              <div style={{ fontSize: '1.5rem'}}>操作頁面</div>
              <div ></div>
              <div style={{ fontSize: '1rem'}}>Operating page</div>
            </div>
          </Button>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleBack}>返回 | Return Page</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default RoleSelectionModal;