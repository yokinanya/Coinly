import { Sparkles } from "lucide-react";
import { useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import type { AnalysisScope } from "../ai/context";
import type { AppData } from "../domain/types";
import { runAiAnalysis } from "./analysisActions";
import { ErrorBanner, PageHeader, SelectField } from "./common";
import type { FormOption } from "./common";
import { Button } from "./components";

const ANALYSIS_SCOPE_OPTIONS: readonly FormOption[] = [
  { value: "current-month", label: "本月" },
  { value: "last-3-months", label: "近 3 个月" },
  { value: "last-6-months", label: "近 6 个月" },
  { value: "year-to-date", label: "今年" },
];

export function AnalysisView(props: { readonly data: AppData }) {
  const [scope, setScope] = useState<AnalysisScope>("current-month");
  const [aiText, setAiText] = useState("");
  const [aiError, setAiError] = useState("");
  const [pending, setPending] = useState(false);
  const run = () => runAiAnalysis({ data: props.data, scope, setAiText, setAiError, setPending });

  return (
    <section className="space-y-5">
      <PageHeader title="AI 分析" />
      <div className="panel max-w-3xl space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(12rem,18rem)_auto] sm:items-end">
          <SelectField label="分析范围" value={scope} options={ANALYSIS_SCOPE_OPTIONS} onChange={(value) => setScope(value as AnalysisScope)} />
          <Button variant="primary" loading={pending} disabled={pending} onClick={run}>
            <Sparkles size={16} />
            分析账单
          </Button>
        </div>
        <ErrorBanner message={aiError} />
        {aiText && <div className="row-card motion-selection p-3 text-sm leading-6"><MessageResponse>{aiText}</MessageResponse></div>}
      </div>
    </section>
  );
}
