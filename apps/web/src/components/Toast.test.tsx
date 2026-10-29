import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { Toast } from "./Toast";

const onUndo = vi.fn();
const onDismiss = vi.fn();

function setup(undoMs?: number) {
  render(
    <Toast
      toast={{ id: 1, text: "تقبّل الله منك 🤍", undoMs }}
      busy={false}
      onUndo={onUndo}
      onDismiss={onDismiss}
    />,
  );
  return screen.getByText("تقبّل الله منك 🤍").parentElement!;
}

/** Drags from (0, 0) by (dx, dy) in `steps` moves, `stepMs` apart. */
function swipe(el: Element, dx: number, dy: number, steps = 4, stepMs = 16) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
  for (let i = 1; i <= steps; i++) {
    vi.advanceTimersByTime(stepMs);
    fireEvent.pointerMove(el, {
      pointerId: 1,
      clientX: (dx * i) / steps,
      clientY: (dy * i) / steps,
    });
  }
  fireEvent.pointerUp(el, { pointerId: 1, clientX: dx, clientY: dy });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Toast swipe", () => {
  it.each([
    ["left", -80, 0],
    ["down", 0, 60],
  ])("a swipe %s dismisses it once it has slid away", (_label, dx, dy) => {
    const el = setup();
    swipe(el, dx, dy);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(250));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["right", 120, 0],
    ["up", 0, -120],
  ])("a swipe %s does nothing", (_label, dx, dy) => {
    const el = setup();
    swipe(el, dx, dy);
    act(() => void vi.advanceTimersByTime(250));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(el.style.translate).toBe("0px 0px");
  });

  it("a short, slow drag springs back", () => {
    const el = setup();
    swipe(el, -40, 0, 4, 250);
    act(() => void vi.advanceTimersByTime(250));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(el.style.translate).toBe("0px 0px");
  });

  it("a quick flick dismisses before the full distance", () => {
    const el = setup();
    swipe(el, 0, 30, 2, 10);
    act(() => void vi.advanceTimersByTime(250));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("follows the finger while dragging", () => {
    const el = setup();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -30, clientY: 4 });
    expect(el.style.translate).toBe("-30px 0px");
  });

  it("a swipe that starts on the undo button does not undo", () => {
    setup(10_000);
    const undo = screen.getByRole("button", { name: t.toast.undo });
    swipe(undo, -80, 0);
    fireEvent.click(undo);
    expect(onUndo).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(250));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("a tap on the undo button still undoes", () => {
    setup(10_000);
    const undo = screen.getByRole("button", { name: t.toast.undo });
    fireEvent.pointerDown(undo, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(undo, { pointerId: 1, clientX: 2, clientY: 1 });
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("a flick after a pause still counts", () => {
    const el = setup();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(600);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 0, clientY: 12 });
    vi.advanceTimersByTime(10);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 0, clientY: 30 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 0, clientY: 30 });
    act(() => void vi.advanceTimersByTime(250));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("a fast move that stops before lifting is not a flick", () => {
    const el = setup();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(10);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 0, clientY: 30 });
    vi.advanceTimersByTime(400);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 0, clientY: 30 });
    act(() => void vi.advanceTimersByTime(250));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("a second finger does not take over a drag", () => {
    const el = setup();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -30, clientY: 0 });
    fireEvent.pointerDown(el, { pointerId: 2, clientX: 100, clientY: 0 });
    fireEvent.pointerUp(el, { pointerId: 2, clientX: 100, clientY: 0 });
    vi.advanceTimersByTime(300);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -40, clientY: 0 });
    expect(el.style.translate).toBe("-40px 0px");
    vi.advanceTimersByTime(300);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: -40, clientY: 0 });
    expect(el.style.translate).toBe("0px 0px");
  });

  it("after a drag that ends with no click, the next click on undo counts", () => {
    setup(10_000);
    const undo = screen.getByRole("button", { name: t.toast.undo });
    swipe(undo, -30, 0, 4, 250);
    act(() => void vi.advanceTimersByTime(0));
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("time running out mid-drag waits for the finger to lift", () => {
    const el = setup();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -30, clientY: 0 });
    act(() => void vi.advanceTimersByTime(6_000));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerUp(el, { pointerId: 1, clientX: -30, clientY: 0 });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("a cancelled drag springs back", () => {
    const el = setup();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -80, clientY: 0 });
    fireEvent.pointerCancel(el, { pointerId: 1 });
    act(() => void vi.advanceTimersByTime(250));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(el.style.translate).toBe("0px 0px");
  });
});
