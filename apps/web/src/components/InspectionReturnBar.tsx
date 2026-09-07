import { useSyncExternalStore } from "react";
import { formatInspectionReturn, getInspectionReturn, type InspectionReturnLocation, subscribeInspectionReturn } from "../inspection-navigation";

export function InspectionReturnBar({ onReturn }: { onReturn: (location: InspectionReturnLocation) => void }) {
  const location = useSyncExternalStore(subscribeInspectionReturn, getInspectionReturn, getInspectionReturn);
  if (!location) return null;
  return <div className="inspection-return" role="status" aria-label="Inspection navigation">
    <span><b>INSPECTION</b> {location.viewport.path ?? (location.kind === "diff" ? "Changes" : "File")}</span>
    <button type="button" onClick={() => onReturn(location)}>{formatInspectionReturn(location)}</button>
  </div>;
}
