import React, { useState, useEffect, useTransition } from "react";
import { useParams } from "react-router-dom";
import NotFound from "../NotFound";

const Assembly = React.lazy(() => import("./optionkey/Assembly"));
const CoatingAnode = React.lazy(() => import("./optionkey/CoatingAnode"));
const CoatingCathode = React.lazy(() => import("./optionkey/CoatingCathode"));
const CuttingCathode = React.lazy(() => import("./optionkey/CuttingCathode"));
const CuttingAnode = React.lazy(() => import("./optionkey/CuttingAnode"));
const Stacking = React.lazy(() => import("./optionkey/Stacking"));
const Oven = React.lazy(() => import("./optionkey/Oven"));
const Injection = React.lazy(() => import("./optionkey/Injection"));
const Chemosynthesis = React.lazy(() => import("./optionkey/Chemosynthesis"));
const Capacity = React.lazy(() => import("./optionkey/Capacity"));
const HTAging = React.lazy(() => import("./optionkey/HTAging"));
const RTAging = React.lazy(() => import("./optionkey/RTAging"));
const EdgeFolding = React.lazy(() => import("./optionkey/EdgeFolding"));
const Sulting = React.lazy(() => import("./optionkey/Sulting"));
const MixingAnode = React.lazy(() => import("./optionkey/MixingAnode"));
const MixingCathode = React.lazy(() => import("./optionkey/MixingCathode"));

function MESEquipmentProInfoRebuildWrapper() {
  const { optionkey } = useParams();
  // State to hold the component to be rendered
  const [ComponentToRender, setComponentToRender] = useState(null);
  // useTransition hook for managing non-urgent updates
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      switch (optionkey) {
        case "assembly":
          setComponentToRender(() => Assembly);
          break;
        case "CoatingAnode":
          setComponentToRender(() => CoatingAnode);
          break;
        case "cutting_cathode":
          setComponentToRender(() => CuttingCathode);
          break;
        case "CoatingCathode":
          setComponentToRender(() => CoatingCathode);
          break;
        case "cutting_anode":
          setComponentToRender(() => CuttingAnode);
          break;
        case "stacking":
          setComponentToRender(() => Stacking);
          break;
        case "oven":
          setComponentToRender(() => Oven);
          break;
        case "injection":
          setComponentToRender(() => Injection);
          break;
        case "chemosynthesis":
          setComponentToRender(() => Chemosynthesis);
          break;
        case "capacity":
          setComponentToRender(() => Capacity);
          break;
        case "ht_aging":
          setComponentToRender(() => HTAging);
          break;
        case "rt_aging":
          setComponentToRender(() => RTAging);
          break;
        case "edgeFolding":
          setComponentToRender(() => EdgeFolding);
          break;
        case "sulting":
          setComponentToRender(() => Sulting);
          break;
        case "mixingAnode":
          setComponentToRender(() => MixingAnode);
          break;
        case "mixingCathode":
          setComponentToRender(() => MixingCathode);
          break;
        default:
          setComponentToRender(() => NotFound);
          break;
      }
    });
  }, [optionkey]);

  if (isPending || !ComponentToRender) {
    return (
      <div className="flex justify-center items-center h-screen text-xl font-semibold text-gray-600">
        等待Mes設備訊息加載...
      </div>
    );
  }

  // Render the determined component
  return <ComponentToRender optionkey={optionkey} />;
}

export default MESEquipmentProInfoRebuildWrapper;
