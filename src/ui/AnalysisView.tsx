import { useState } from "react";
import type { AppData } from "../domain/types";
import { runAiAnalysis } from "./analysisActions";
import { ErrorBanner } from "./common";
import { Button, Drawer } from "./metis";

const ANALYSIS_DRAWER_WIDTH = 560;

export function AnalysisDrawer(props: { readonly open: boolean; readonly data: AppData; readonly onClose: () => void }) {
  const [aiText, setAiText] = useState("");
  const [aiError, setAiError] = useState("");
  return (
    <Drawer open={props.open} title="分析" width={ANALYSIS_DRAWER_WIDTH} onClose={props.onClose}>
      <div className="space-y-4">
        <Button variant="primary" onClick={() => runAiAnalysis(props.data, setAiText, setAiError)}>生成分析</Button>
        <ErrorBanner message={aiError} />
        {aiText && <pre className="row-card whitespace-pre-wrap p-3 text-sm">{aiText}</pre>}
      </div>
    </Drawer>
  );
}
