import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Floor = 1 | 2;
type Mode = "room" | "door";
type Cat = "living" | "room" | "water" | "storage" | "free";
type DoorType = "hinged-r" | "hinged-l" | "sliding" | "folding" | "pocket";
type DoorOrient = "h" | "v";
type Drag = { kind: "room" | "door"; id: string; ox: number; oy: number } | null;

type Room = { id: string; name: string; cat: Cat; x: number; y: number; w: number; h: number };
type Door = { id: string; x: number; y: number; orient: DoorOrient; type: DoorType; width: 1 | 2 | 3 | 4 };
type Saved = { version: 1; rooms: Record<Floor, Room[]>; doors: Record<Floor, Door[]> };

const C = 34;
const GW = 14;
const GH = 12;
const W = GW * C;
const H = GH * C;
const KEY = "floorplanly-v1";

const INIT_ROOMS: Record<Floor, Room[]> = {
  1: [
    { id: "r1", name: "Living", cat: "living", x: 3, y: 7, w: 5, h: 4 },
    { id: "r2", name: "Dining", cat: "living", x: 8, y: 7, w: 4, h: 4 },
    { id: "r3", name: "Bath", cat: "water", x: 10, y: 4, w: 2, h: 2 },
  ],
  2: [
    { id: "r4", name: "Main", cat: "room", x: 0, y: 6, w: 5, h: 3 },
    { id: "r5", name: "Kids", cat: "room", x: 0, y: 0, w: 4, h: 3 },
    { id: "r6", name: "Free", cat: "free", x: 5, y: 9, w: 4, h: 3 },
  ],
};
const INIT_DOORS: Record<Floor, Door[]> = {
  1: [{ id: "d1", x: 6, y: 7, orient: "h", type: "hinged-r", width: 2 }],
  2: [{ id: "d2", x: 5, y: 7.5, orient: "v", type: "sliding", width: 2 }],
};

const DOOR_TYPES: DoorType[] = ["hinged-r", "hinged-l", "sliding", "folding", "pocket"];
const CATS: Cat[] = ["living", "room", "water", "storage", "free"];
const uid = (p: string): string => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const snap = (v: number): number => Math.round(v * 2) / 2;
const clone = <T extends object>(o: Record<Floor, T[]>): Record<Floor, T[]> => ({ 1: o[1].map((v) => ({ ...v })), 2: o[2].map((v) => ({ ...v })) });
const badRooms = (rooms: Room[]): Set<string> => {
  const g = new Map<string, string>(); const bad = new Set<string>();
  rooms.forEach((r) => { for (let dx = 0; dx < r.w; dx++) for (let dy = 0; dy < r.h; dy++) { const k = `${r.x + dx},${r.y + dy}`; const e = g.get(k); if (e) { bad.add(e); bad.add(r.id); } else g.set(k, r.id); } });
  return bad;
};

function App() {
  const [rooms, setRooms] = useState<Record<Floor, Room[]>>(() => clone(INIT_ROOMS));
  const [doors, setDoors] = useState<Record<Floor, Door[]>>(() => clone(INIT_DOORS));
  const [floor, setFloor] = useState<Floor>(1);
  const [mode, setMode] = useState<Mode>("room");
  const [sr, setSr] = useState<string | null>(null);
  const [sd, setSd] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [brushType, setBrushType] = useState<DoorType>("hinged-r");
  const [brushOrient, setBrushOrient] = useState<DoorOrient>("v");
  const [brushWidth, setBrushWidth] = useState<1 | 2 | 3 | 4>(2);
  const [toast, setToast] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const curR = rooms[floor]; const curD = doors[floor];
  const selR = curR.find((r) => r.id === sr) ?? null;
  const selD = curD.find((d) => d.id === sd) ?? null;
  const overlaps = useMemo(() => badRooms(curR), [curR]);
  const total = useMemo(() => curR.reduce((s, r) => s + (r.w * r.h) / 2, 0), [curR]);
  const toastMsg = (s: string): void => { setToast(s); window.setTimeout(() => setToast(""), 1800); };
  const p = useCallback((cx: number, cy: number): { x: number; y: number } => {
    const r = svgRef.current?.getBoundingClientRect(); if (!r) return { x: 0, y: 0 };
    return { x: (cx - r.left) / C, y: (cy - r.top) / C };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return;
      const d = JSON.parse(raw) as Saved;
      if (d.version !== 1 || !d.rooms || !d.doors) return;
      setRooms(clone(d.rooms)); setDoors(clone(d.doors)); toastMsg("restored");
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { const d: Saved = { version: 1, rooms, doors }; localStorage.setItem(KEY, JSON.stringify(d)); }, [rooms, doors]);

  useEffect(() => {
    const mv = (e: PointerEvent): void => {
      if (!drag) return; const { x, y } = p(e.clientX, e.clientY);
      if (drag.kind === "room") {
        setRooms((s) => ({ ...s, [floor]: s[floor].map((r) => r.id !== drag.id ? r : { ...r, x: clamp(Math.round(x - drag.ox), 0, GW - r.w), y: clamp(Math.round(y - drag.oy), 0, GH - r.h) }) }));
      } else {
        setDoors((s) => ({ ...s, [floor]: s[floor].map((d) => d.id !== drag.id ? d : { ...d, x: clamp(snap(x - drag.ox), 0, GW), y: clamp(snap(y - drag.oy), 0, GH) }) }));
      }
    };
    const up = (): void => setDrag(null);
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
  }, [drag, floor, p]);

  const addRoom = (): void => {
    const n: Room = { id: uid("room"), name: `Room ${curR.length + 1}`, cat: "room", x: 0, y: 0, w: 3, h: 3 };
    setRooms((s) => ({ ...s, [floor]: [...s[floor], n] })); setSr(n.id); setSd(null); toastMsg("room added");
  };
  const delRoom = (): void => { if (!sr) return; setRooms((s) => ({ ...s, [floor]: s[floor].filter((r) => r.id !== sr) })); setSr(null); toastMsg("room deleted"); };
  const delDoor = (): void => { if (!sd) return; setDoors((s) => ({ ...s, [floor]: s[floor].filter((d) => d.id !== sd) })); setSd(null); toastMsg("door deleted"); };
  const rotRoom = (): void => { if (!sr) return; setRooms((s) => ({ ...s, [floor]: s[floor].map((r) => r.id !== sr ? r : (r.x + r.h <= GW && r.y + r.w <= GH ? { ...r, w: r.h, h: r.w } : r)) })); };
  const resizeRoom = (dw: number, dh: number): void => {
    if (!sr) return;
    setRooms((s) => ({ ...s, [floor]: s[floor].map((r) => {
      if (r.id !== sr) return r; const w = clamp(r.w + dw, 1, GW); const h = clamp(r.h + dh, 1, GH);
      return r.x + w > GW || r.y + h > GH ? r : { ...r, w, h };
    }) }));
  };

  const clickCanvas = (e: React.MouseEvent<SVGSVGElement>): void => {
    if (mode === "room") { setSr(null); setSd(null); return; }
    const { x, y } = p(e.clientX, e.clientY);
    const n: Door = { id: uid("door"), x: clamp(snap(x), 0, GW), y: clamp(snap(y), 0, GH), orient: brushOrient, type: brushType, width: brushWidth };
    setDoors((s) => ({ ...s, [floor]: [...s[floor], n] })); setSd(n.id); setSr(null); toastMsg("door added");
  };

  const saveJson = (): void => {
    const blob = new Blob([JSON.stringify({ version: 1, rooms, doors }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "floorplanly-plan.json"; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const loadJson = (f: File): void => {
    const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(String(r.result)) as Saved; if (d.version !== 1) throw new Error(); setRooms(clone(d.rooms)); setDoors(clone(d.doors)); setSr(null); setSd(null); toastMsg("json loaded"); } catch { toastMsg("invalid json"); } };
    r.readAsText(f);
  };

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}
      <header className="head"><h1>FloorPlanly</h1><p>{floor}F / {total.toFixed(1)} tatami</p></header>
      <div className="tools">
        <button className={floor === 1 ? "on" : ""} onClick={() => { setFloor(1); setSr(null); setSd(null); }}>1F</button>
        <button className={floor === 2 ? "on" : ""} onClick={() => { setFloor(2); setSr(null); setSd(null); }}>2F</button>
        <button className={mode === "room" ? "on" : ""} onClick={() => { setMode("room"); setSd(null); }}>Room</button>
        <button className={mode === "door" ? "on" : ""} onClick={() => { setMode("door"); setSr(null); }}>Door</button>
        <button onClick={addRoom}>Add Room</button><button onClick={delRoom} disabled={!selR}>Delete Room</button><button onClick={delDoor} disabled={!selD}>Delete Door</button>
        <button onClick={saveJson}>Export</button><button onClick={() => fileRef.current?.click()}>Import</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadJson(f); e.target.value = ""; }} />
      </div>
      <main className="main">
        <section className="canvasWrap">
          <svg ref={svgRef} className="canvas" width={W} height={H} viewBox={`0 0 ${W} ${H}`} onClick={clickCanvas}>
            {Array.from({ length: GW + 1 }).map((_, i) => <line key={`x-${i}`} x1={i * C} y1={0} x2={i * C} y2={H} stroke="rgba(138,167,184,.35)" strokeWidth="1" />)}
            {Array.from({ length: GH + 1 }).map((_, i) => <line key={`y-${i}`} x1={0} y1={i * C} x2={W} y2={i * C} stroke="rgba(138,167,184,.35)" strokeWidth="1" />)}
            {curR.map((r) => {
              const x = r.x * C; const y = r.y * C; const w = r.w * C; const h = r.h * C; const sel = sr === r.id;
              const fill = r.cat === "living" ? "rgba(243,171,97,.3)" : r.cat === "water" ? "rgba(101,189,233,.3)" : r.cat === "storage" ? "rgba(167,133,205,.3)" : r.cat === "free" ? "rgba(96,194,171,.3)" : "rgba(131,197,145,.3)";
              return (
                <g key={r.id} onClick={(e) => { e.stopPropagation(); setSr(r.id); setSd(null); }} onPointerDown={(e) => { if (mode !== "room") return; e.stopPropagation(); const q = p(e.clientX, e.clientY); setDrag({ kind: "room", id: r.id, ox: q.x - r.x, oy: q.y - r.y }); setSr(r.id); setSd(null); }}>
                  <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke={overlaps.has(r.id) ? "#d23f3f" : sel ? "#4fd0ff" : "rgba(227,238,245,.65)"} strokeWidth={sel ? 3 : 2} />
                  <text x={x + w / 2} y={y + h / 2 - 6} textAnchor="middle" className="name">{r.name}</text>
                  <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" className="sub">{(r.w * r.h / 2).toFixed(1)} tatami</text>
                </g>
              );
            })}
            {curD.map((d) => {
              const x = d.x * C; const y = d.y * C; const len = (d.width * C) / 2; const sel = sd === d.id;
              return (
                <g key={d.id} onClick={(e) => { e.stopPropagation(); setSd(d.id); setSr(null); }} onPointerDown={(e) => { if (mode !== "door") return; e.stopPropagation(); const q = p(e.clientX, e.clientY); setDrag({ kind: "door", id: d.id, ox: q.x - d.x, oy: q.y - d.y }); setSd(d.id); setSr(null); }}>
                  <rect x={d.orient === "h" ? x - 4 : x - 6} y={d.orient === "h" ? y - 6 : y - 4} width={d.orient === "h" ? len + 10 : 12} height={d.orient === "h" ? 12 : len + 10} fill="rgba(255,255,255,.02)" />
                  {d.orient === "h" ? <line x1={x} y1={y} x2={x + len} y2={y} stroke={sel ? "#4fd0ff" : "#ffe5b1"} strokeWidth={sel ? 2 : 1.4} /> : <line x1={x} y1={y} x2={x} y2={y + len} stroke={sel ? "#4fd0ff" : "#ffe5b1"} strokeWidth={sel ? 2 : 1.4} />}
                </g>
              );
            })}
            <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke="rgba(216,235,247,.35)" strokeWidth={2} rx={9} />
          </svg>
        </section>
        <aside className="side">
          <h2>Inspector</h2>
          {mode === "room" ? (
            selR ? <div className="card"><label>Name<input value={selR.name} onChange={(e) => setRooms((s) => ({ ...s, [floor]: s[floor].map((r) => r.id === selR.id ? { ...r, name: e.target.value } : r) }))} /></label><label>Category<select value={selR.cat} onChange={(e) => setRooms((s) => ({ ...s, [floor]: s[floor].map((r) => r.id === selR.id ? { ...r, cat: e.target.value as Cat } : r) }))}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label><p>x:{selR.x} y:{selR.y} w:{selR.w} h:{selR.h}</p><div className="row"><button onClick={() => resizeRoom(1, 0)}>W+</button><button onClick={() => resizeRoom(-1, 0)}>W-</button><button onClick={() => resizeRoom(0, 1)}>H+</button><button onClick={() => resizeRoom(0, -1)}>H-</button><button onClick={rotRoom}>Rotate</button></div></div> : <div className="card"><p>Select a room.</p></div>
          ) : (
            <div className="card"><label>Door type<select value={brushType} onChange={(e) => setBrushType(e.target.value as DoorType)}>{DOOR_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><label>Orientation<select value={brushOrient} onChange={(e) => setBrushOrient(e.target.value as DoorOrient)}><option value="v">vertical</option><option value="h">horizontal</option></select></label><label>Width<input type="range" min={1} max={4} step={1} value={brushWidth} onChange={(e) => setBrushWidth(Number(e.target.value) as 1 | 2 | 3 | 4)} /></label>{selD ? <div><p>x:{selD.x} y:{selD.y}</p><label>Type<select value={selD.type} onChange={(e) => setDoors((s) => ({ ...s, [floor]: s[floor].map((d) => d.id === selD.id ? { ...d, type: e.target.value as DoorType } : d) }))}>{DOOR_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label><label>Orient<select value={selD.orient} onChange={(e) => setDoors((s) => ({ ...s, [floor]: s[floor].map((d) => d.id === selD.id ? { ...d, orient: e.target.value as DoorOrient } : d) }))}><option value="v">vertical</option><option value="h">horizontal</option></select></label></div> : <p>Click canvas to add door.</p>}</div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
