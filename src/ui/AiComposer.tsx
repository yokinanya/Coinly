import { ArrowUp, Check, ChevronDown, ImagePlus, Settings2, Square, X } from "lucide-react";
import { useRef, useState } from "react";
import type { SessionModelOption } from "./aiModelSelection";
import { Button, FloatingMenu, Input, Upload } from "./components";
import type { AiAttachment } from "./aiSession";

export function AiComposer(props: {
  readonly draft: string;
  readonly attachment?: AiAttachment;
  readonly options: readonly SessionModelOption[];
  readonly selectedModel: string;
  readonly supportsVision: boolean;
  readonly pending: boolean;
  readonly setDraft: (value: string) => void;
  readonly setAttachment: (attachment?: AiAttachment) => void;
  readonly selectModel: (value: string) => void;
  readonly openManager: () => void;
  readonly submit: () => void;
  readonly stop: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const canSubmit = Boolean(props.draft.trim() || props.attachment);
  return (
    <form className="ai-composer" aria-label="AI 消息" onSubmit={(event) => { event.preventDefault(); props.submit(); }}>
      <Input.TextArea
        autoSize={{ minRows: 1, maxRows: 6 }}
        value={props.draft}
        onChange={(value) => props.setDraft(String(value))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            props.submit();
          }
        }}
        name="ai-message"
        autoComplete="off"
        aria-label="输入消息"
        placeholder="问账、分析或记录一笔交易…"
      />
      {props.attachment && <Attachment attachment={props.attachment} remove={() => props.setAttachment(undefined)} />}
      <div className="flex min-h-11 items-center justify-between gap-2">
        <Upload
          accept="image/*"
          beforeUpload={(file) => {
            if (props.attachment) URL.revokeObjectURL(props.attachment.url);
            props.setAttachment({ file, url: URL.createObjectURL(file), name: file.name });
            return Upload.LIST_IGNORE;
          }}
          disabled={!props.supportsVision || props.pending}
          maxCount={1}
          showUploadList={false}
        >
          <button className="ai-composer-icon" type="button" aria-label="插入图片" title={props.supportsVision ? "插入图片" : "当前模型不支持图片"} disabled={!props.supportsVision || props.pending}>
            <ImagePlus size={18} aria-hidden="true" />
          </button>
        </Upload>
        <div className="relative flex min-w-0 flex-1 items-center justify-end gap-2">
          <button ref={triggerRef} className="ai-model-trigger" type="button" aria-label="切换模型" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <span className="min-w-0 truncate">{props.options.find((option) => option.value === props.selectedModel)?.label ?? "选择模型"}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {menuOpen && <ModelMenu triggerRef={triggerRef} options={props.options} selected={props.selectedModel} close={() => setMenuOpen(false)} select={props.selectModel} openManager={props.openManager} />}
          {props.pending
            ? <Button className="ai-send-button" variant="default" aria-label="停止生成" title="停止生成" onClick={props.stop}><Square size={15} fill="currentColor" aria-hidden="true" /></Button>
            : <Button className="ai-send-button" variant="primary" htmlType="submit" aria-label="发送" title="发送" disabled={!canSubmit}><ArrowUp size={18} strokeWidth={2.5} aria-hidden="true" /></Button>}
        </div>
      </div>
    </form>
  );
}

function Attachment(props: { readonly attachment: AiAttachment; readonly remove: () => void }) {
  return (
    <div className="ai-image-attachment">
      <ImagePlus size={15} aria-hidden="true" />
      <span className="min-w-0 truncate">{props.attachment.name}</span>
      <button type="button" aria-label="移除图片" title="移除图片" onClick={() => { URL.revokeObjectURL(props.attachment.url); props.remove(); }}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function ModelMenu(props: {
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>;
  readonly options: readonly SessionModelOption[];
  readonly selected: string;
  readonly close: () => void;
  readonly select: (value: string) => void;
  readonly openManager: () => void;
}) {
  return (
    <FloatingMenu triggerRef={props.triggerRef} close={props.close} preferredHeight={240}>
      <div className="ai-model-menu" role="menu" aria-label="模型列表">
        {props.options.map((option, index) => (
          <div key={option.value}>
            {(index === 0 || props.options[index - 1]?.providerId !== option.providerId) && <div className="ai-model-provider-label">{option.providerName}</div>}
            <button className={option.value === props.selected ? "ai-model-option ai-model-option-selected" : "ai-model-option"} type="button" role="menuitemradio" aria-checked={option.value === props.selected} onClick={() => { props.select(option.value); props.close(); }}>
              <span className="min-w-0 truncate">{option.label}</span>
              {option.value === props.selected && <Check size={15} aria-hidden="true" />}
            </button>
          </div>
        ))}
        <div className="border-t border-(--color-border) pt-1">
          <button className="ai-model-option" type="button" role="menuitem" onClick={() => { props.close(); props.openManager(); }}>
            <Settings2 size={15} aria-hidden="true" />管理模型
          </button>
        </div>
      </div>
    </FloatingMenu>
  );
}
