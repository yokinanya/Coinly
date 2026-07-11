import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationSidebar } from "./appNavigation";

describe("NavigationSidebar", () => {
  afterEach(() => cleanup());

  it("uses links for routes and keeps the current view in sync", () => {
    const setViewId = vi.fn();
    renderNavigation(setViewId);

    const desktop = screen.getByRole("navigation", { name: "桌面主导航" });
    expect(desktop.querySelector('a[href="/stats"]')).toBeTruthy();
    expect(desktop.querySelector('a[href="/accounts"]')).toBeTruthy();

    fireEvent.click(screen.getAllByRole("link", { name: "统计" })[0]);
    expect(setViewId).toHaveBeenCalledWith("stats");
    expect(window.location.pathname).toBe("/stats");
  });

  it("shows primary mobile destinations and reveals secondary routes", () => {
    renderNavigation(vi.fn());

    const mobile = screen.getByRole("navigation", { name: "移动主导航" });
    expect(mobile.querySelectorAll("a")).toHaveLength(5);
    expect(mobile.querySelector('a[href="/ai"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "更多" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "账户" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "分类标签" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "助手" })).toHaveLength(2);
  });

  it("can collapse and expand the desktop sidebar", () => {
    renderNavigation(vi.fn());

    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeTruthy();
  });
});

function renderNavigation(setViewId: (id: Parameters<typeof NavigationSidebar>[0]["viewId"]) => void) {
  window.history.replaceState(null, "", "/");
  return render(
    <NavigationSidebar
      viewId="home"
      setViewId={setViewId}
      theme="system"
      syncDisabled={false}
      syncing={false}
      onThemeChange={vi.fn()}
      onSync={vi.fn()}
    />,
  );
}