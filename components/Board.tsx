"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil, Eraser, Undo2, Redo2, Trash2 } from "lucide-react";
import type { RealtimeSocket } from "./realtime";
import { useGame } from "./store";
import type { Stroke } from "../shared/types";
import { useDialog } from "./useDialog";
const colors = [
  "#222a3f",
  "#f05264",
  "#ff963e",
  "#f5cd37",
  "#54c974",
  "#5865ef",
  "#9655ed",
  "#eb64c3",
];
export default function Board({
  socket,
  children,
}: {
  socket: RealtimeSocket | null;
  children?: React.ReactNode;
}) {
  const { room, id, stroke } = useGame();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      area = canvas?.parentElement;
    if (!canvas || !area) return;
    const fit = () => {
      const { width, height } = area.getBoundingClientRect();
      const scale = Math.min(width / canvas.width, height / canvas.height);
      area.style.setProperty("--canvas-width", `${canvas.width * scale}px`);
      area.style.setProperty("--canvas-height", `${canvas.height * scale}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);
  const active = useRef<{
    id: string;
    pointerId: number;
    turn: number;
    color: string;
    width: number;
    points: Stroke["points"];
  } | null>(null);
  const [color, setColor] = useState(colors[5]);
  const [width, setWidth] = useState(8);
  const [eraser, setEraser] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const clearRef = useRef<HTMLDivElement>(null);
  useDialog(confirmClear, clearRef, () => setConfirmClear(false));
  const can = room?.phase === "DRAWING" && room.drawer === id;
  useEffect(() => {
    active.current = null;
    setConfirmClear(false);
  }, [room?.turn, can]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of room?.strokes ?? []) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.points.forEach((p, i) => {
        if (!i) ctx.moveTo(p.x * c.width, p.y * c.height);
        else ctx.lineTo(p.x * c.width, p.y * c.height);
      });
      ctx.stroke();
      if (s.points.length === 1) {
        const p = s.points[0];
        ctx.beginPath();
        ctx.arc(p.x * c.width, p.y * c.height, s.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [room?.strokes]);
  function pos(e: React.PointerEvent) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }
  function flush() {
    if (
      !active.current ||
      !room ||
      !socket ||
      !socket.connected ||
      !can ||
      active.current.turn !== room.turn
    )
      return;
    const s: Stroke = {
      id: active.current.id,
      points: active.current.points.slice(),
      color: active.current.color,
      width: active.current.width,
    };
    if (!s.points.length) return;
    socket.emit("draw", { turn: room.turn, stroke: s }, (a) => {
      if (!a.ok)
        useGame.setState((state) => ({
          room:
            state.room?.code === room.code && state.room.turn === room.turn
              ? {
                  ...state.room,
                  strokes: state.room.strokes.filter((item) => item !== s),
                }
              : state.room,
        }));
    });
    stroke(s, room.turn);
    active.current.points = s.points.slice(-1);
  }
  const last = useRef(0);
  return (
    <div className={`board panel ${can ? "can-draw" : "view-only"}`}>
      <div className="canvas-area">
        <canvas
          ref={ref}
          width={1200}
          height={750}
          aria-label="实时绘画画布"
          className={can ? "drawable" : ""}
          onPointerDown={(e) => {
            if (
              !can ||
              !socket?.connected ||
              !e.isPrimary ||
              active.current ||
              (e.pointerType === "mouse" && e.button !== 0)
            )
              return;
            e.currentTarget.setPointerCapture(e.pointerId);
            active.current = {
              id: crypto.randomUUID(),
              pointerId: e.pointerId,
              turn: room!.turn,
              color: eraser ? "#ffffff" : color,
              width: eraser ? width * 3 : width,
              points: [pos(e)],
            };
            last.current = Date.now();
            flush();
          }}
          onPointerMove={(e) => {
            if (
              !can ||
              !active.current ||
              e.pointerId !== active.current.pointerId
            )
              return;
            active.current.points.push(pos(e));
            if (
              Date.now() - last.current > 25 ||
              active.current.points.length >= 35
            ) {
              flush();
              last.current = Date.now();
            }
          }}
          onPointerUp={(e) => {
            if (active.current?.pointerId === e.pointerId) {
              flush();
              active.current = null;
            }
          }}
          onPointerCancel={(e) => {
            if (active.current?.pointerId !== e.pointerId) return;
            flush();
            active.current = null;
          }}
          onLostPointerCapture={() => {
            active.current = null;
          }}
        />
        {children}
        {confirmClear && (
          <div
            ref={clearRef}
            tabIndex={-1}
            className="clear-prompt"
            role="alertdialog"
            aria-modal="true"
            aria-label="确认清空画布"
          >
            <p>清空当前画布？此操作无法撤销。</p>
            <button onClick={() => setConfirmClear(false)}>取消</button>
            <button
              onClick={() => {
                socket?.emit("edit", { turn: room?.turn, action: "clear" });
                setConfirmClear(false);
              }}
            >
              确认清空
            </button>
          </div>
        )}
      </div>
      <div className="toolbar">
        <div className="toolgroup">
          <button
            title="画笔"
            aria-label="画笔"
            aria-pressed={!eraser}
            disabled={!can}
            className={!eraser ? "selected" : ""}
            onClick={() => setEraser(false)}
          >
            <Pencil size={21} />
          </button>
          <button
            title="橡皮擦"
            aria-label="橡皮擦"
            aria-pressed={eraser}
            disabled={!can}
            className={eraser ? "selected" : ""}
            onClick={() => setEraser(true)}
          >
            <Eraser size={21} />
          </button>
        </div>
        <div className="swatches">
          {colors.map((c) => (
            <button
              key={c}
              aria-label={`颜色 ${c}`}
              aria-pressed={color === c && !eraser}
              disabled={!can}
              className={color === c && !eraser ? "active" : ""}
              onClick={() => {
                setColor(c);
                setEraser(false);
              }}
            >
              <span style={{ background: c }} />
            </button>
          ))}
        </div>
        <div className="toolgroup edits">
          {[
            [Undo2, "撤销", "undo"],
            [Redo2, "重做", "redo"],
            [Trash2, "清空", "clear"],
          ].map(([Icon, label, action]) => {
            const I = Icon as typeof Undo2;
            return (
              <button
                key={String(action)}
                aria-label={String(label)}
                title={String(label)}
                disabled={!can || (action === "undo" && !room?.strokes.length)}
                onClick={() =>
                  action === "clear"
                    ? setConfirmClear(true)
                    : socket?.emit("edit", { turn: room?.turn, action })
                }
              >
                <I size={20} />
              </button>
            );
          })}
        </div>
        <label className="brush-size" title="画笔粗细">
          <span
            style={{
              width: Math.min(width + 3, 18),
              height: Math.min(width + 3, 18),
            }}
          />
          <input
            aria-label="画笔粗细"
            type="range"
            disabled={!can}
            min="2"
            max="12"
            value={width}
            onChange={(e) => setWidth(+e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
