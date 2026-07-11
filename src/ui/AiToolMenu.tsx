import type { AiToolOption } from "./aiTools";

export function AiToolMenu(props: {
  readonly tools: readonly AiToolOption[];
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onSelect: (tool: AiToolOption) => void;
}) {
  return (
    <div className="ai-tool-menu" role="listbox" aria-label="AI 工具">
      <div className="ai-tool-menu-label">选择工具</div>
      {props.tools.map((tool, index) => {
        const Icon = tool.icon;
        const active = index === props.activeIndex;
        return (
          <button
            key={tool.mode}
            className={active ? "ai-tool-option ai-tool-option-active" : "ai-tool-option"}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => props.onActiveIndexChange(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onSelect(tool)}
          >
            <span className="ai-tool-icon"><Icon size={16} aria-hidden="true" /></span>
            <span className="min-w-0"><strong>@{tool.label}</strong><small>{tool.description}</small></span>
          </button>
        );
      })}
      {props.tools.length === 0 && <div className="p-3 text-sm text-(--color-text-secondary)">没有匹配的工具</div>}
    </div>
  );
}