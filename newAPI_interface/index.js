import Button from "react-bootstrap/Button";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";

const MES_EquipmentProInfo_reBuild = () => {
    const { optionkey } = useParams();
    const navigate = useNavigate();
    const [inputValue, setInputValue] = useState("");

    const opitionkey = {
        CoatingCathode : "正極塗佈",
        CoatingAnode: "負極塗佈",
        cutting_cathode: "正極模切",
        cutting_anode: "負極模切",
        stacking : "疊片",
        assembly : "入殼",
        oven : "真空電芯-大烘箱/極片-小烘箱",
        injection: "注液",
        chemosynthesis : "化成",
        capacity : "分容",
        ht_aging : "H.T. Aging(高溫倉靜置)",
        rt_aging : "R.T. Aging(常溫倉靜置)",
        edgeFolding : "精封",
        sulting : "分選判別",
        mixingAnode: "負極混漿",
        mixingCathode: "正極混漿",
    };

    // 取得 key by 中文
    const getKeyByValue = (value) => {
        return Object.keys(opitionkey).find(key => opitionkey[key] === value || key === value);
    };

    // 處理 Enter 事件
    const handleInputKeyDown = (e) => {
        if (e.key === "Enter") {
            const key = getKeyByValue(inputValue);
            if (key) {
                navigate(`/mes_equipmentrecord_rebuild/${key}`);
            }
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", margin: "1vh 0 3vh 0" , flexDirection: "row", alignItems: "center" }}>
            <div style={{
                marginRight: "1vw",
                fontWeight: "bold",
                fontSize: "1.2rem",
            }}>目前選擇的工序: {optionkey ? opitionkey[optionkey] : "未選擇"}</div>
            <div>
                <input
                    id="type"
                    type="text"
                    list="typelist"
                    placeholder="請選擇"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                />
                <datalist id="typelist">
                    {Object.keys(opitionkey).map((key) => (
                        <option key={key} value={opitionkey[key]}>
                            {opitionkey[key]}
                        </option>
                    ))}
                </datalist>
                <Button
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                        const key = getKeyByValue(inputValue);
                        if (key) {
                            navigate(`/mes_equipmentrecord_rebuild/${key}`);
                        }
                    }}
                >
                    前往
                </Button>
            </div>
        </div>
    );
}

export default MES_EquipmentProInfo_reBuild;