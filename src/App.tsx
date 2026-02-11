import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Floor = 1 | 2;
type Mode = "room" | "door";
type Category = "living" | "room" | "water" | "storage" | "free";
type DoorType = "hinged-r" | "hinged-l" | "sliding" | "folding" | "pocket";
type DoorOrient = "h" | "v";
type DragState = { kind: "room" | "door"; id: string; ox: number; oy: number } | null;

type Room = {
  id: string;
  name: string;
  category: Category;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Door = {
  id: string;
  x: number;
  y: number;
  orient: DoorOrient;
  type: DoorType;
  width: 1 | 2 | 3 | 4;
};

type SavedState = {
  version: 1;
  rooms: Record<Floor, Room[]>;
  doors: Record<Floor, Door[]>;
};

const CELL = 34;
const GRID_W = 14;
const GRID_H = 12;
const CANVAS_W = GRID_W * CELL;
const CANVAS_H = GRID_H * CELL;
const STORAGE_KEY = "floorplanly-v1";

const CATEGORY_LABELS: Record<Category, string> = {
  living: "LDK",
  room: "居室",
  water: "水回り",
  storage: "収納",
  free: "フリー",
};

const DOOR_TYPE_LABELS: Record<DoorType, string> = {
  "hinged-r": "開き戸(右)",
  "hinged-l": "開き戸(左)",
  sliding: "引き戸",
  folding: "折れ戸",
  pocket: "片引き戸",
};

const CATEGORY_COLORS: Record<Category, string> = {
  living: "rgba(243,171,97,.3)",
  water: "rgba(101,189,233,.3)",
  storage: "rgba(167,133,205,.3)",
  free: "rgba(96,194,171,.3)",
  room: "rgba(131,197,145,.3)",
};

const INITIAL_ROOMS: Record<Floor, Room[]> = {
  1: [
    { id: "r1", name: "リビング", category: "living", x: 3, y: 7, w: 5, h: 4 },
    { id: "r2", name: "ダイニング", category: "living", x: 8, y: 7, w: 4, h: 4 },
    { id: "r3", name: "浴室", category: "water", x: 10, y: 4, w: 2, h: 2 },
  ],
  2: [
    { id: "r4", name: "主寝室", category: "room", x: 0, y: 6, w: 5, h: 3 },
    { id: "r5", name: "子ども室", category: "room", x: 0, y: 0, w: 4, h: 3 },
    { id: "r6", name: "フリースペース", category: "free", x: 5, y: 9, w: 4, h: 3 },
  ],
};

const INITIAL_DOORS: Record<Floor, Door[]> = {
  1: [{ id: "d1", x: 6, y: 7, orient: "h", type: "hinged-r", width: 2 }],
  2: [{ id: "d2", x: 5, y: 7.5, orient: "v", type: "sliding", width: 2 }],
};

const DOOR_TYPES: DoorType[] = ["hinged-r", "hinged-l", "sliding", "folding", "pocket"];
const CATEGORIES: Category[] = ["living", "room", "water", "storage", "free"];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const snap = (value: number): number => Math.round(value * 2) / 2;
const uid = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
const deepClone = <T extends object>(floors: Record<Floor, T[]>): Record<Floor, T[]> => ({
  1: floors[1].map((v) => ({ ...v })),
  2: floors[2].map((v) => ({ ...v })),
});

const getOverlapRooms = (rooms: Room[]): Set<string> => {
  const grid = new Map<string, string>();
  const overlaps = new Set<string>();

  rooms.forEach((room) => {
    for (let dx = 0; dx < room.w; dx += 1) {
      for (let dy = 0; dy < room.h; dy += 1) {
        const key = `${room.x + dx},${room.y + dy}`;
        const existing = grid.get(key);
        if (existing) {
          overlaps.add(existing);
          overlaps.add(room.id);
        } else {
          grid.set(key, room.id);
        }
      }
    }
  });

  return overlaps;
};

function App() {
  const [rooms, setRooms] = useState<Record<Floor, Room[]>>(() => deepClone(INITIAL_ROOMS));
  const [doors, setDoors] = useState<Record<Floor, Door[]>>(() => deepClone(INITIAL_DOORS));
  const [floor, setFloor] = useState<Floor>(1);
  const [mode, setMode] = useState<Mode>("room");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [brushType, setBrushType] = useState<DoorType>("hinged-r");
  const [brushOrient, setBrushOrient] = useState<DoorOrient>("v");
  const [brushWidth, setBrushWidth] = useState<1 | 2 | 3 | 4>(2);
  const [toast, setToast] = useState("");

  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const currentRooms = rooms[floor];
  const currentDoors = doors[floor];
  const selectedRoom = currentRooms.find((r) => r.id === selectedRoomId) ?? null;
  const selectedDoor = currentDoors.find((d) => d.id === selectedDoorId) ?? null;

  const overlaps = useMemo(() => getOverlapRooms(currentRooms), [currentRooms]);
  const totalTatami = useMemo(
    () => currentRooms.reduce((sum, room) => sum + (room.w * room.h) / 2, 0),
    [currentRooms],
  );

  const showToast = (message: string): void => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };

  const getGridPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / CELL,
      y: (clientY - rect.top) / CELL,
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedState;
      if (parsed.version !== 1 || !parsed.rooms || !parsed.doors) return;
      setRooms(deepClone(parsed.rooms));
      setDoors(deepClone(parsed.doors));
      showToast("前回の状態を復元しました");
    } catch {
      showToast("保存データの読み込みに失敗しました");
    }
  }, []);

  useEffect(() => {
    const payload: SavedState = { version: 1, rooms, doors };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [rooms, doors]);

  useEffect(() => {
    const handleMove = (event: PointerEvent): void => {
      if (!drag) return;
      const point = getGridPoint(event.clientX, event.clientY);

      if (drag.kind === "room") {
        setRooms((state) => ({
          ...state,
          [floor]: state[floor].map((room) =>
            room.id !== drag.id
              ? room
              : {
                  ...room,
                  x: clamp(Math.round(point.x - drag.ox), 0, GRID_W - room.w),
                  y: clamp(Math.round(point.y - drag.oy), 0, GRID_H - room.h),
                },
          ),
        }));
      } else {
        setDoors((state) => ({
          ...state,
          [floor]: state[floor].map((door) =>
            door.id !== drag.id
              ? door
              : {
                  ...door,
                  x: clamp(snap(point.x - drag.ox), 0, GRID_W),
                  y: clamp(snap(point.y - drag.oy), 0, GRID_H),
                },
          ),
        }));
      }
    };

    const handleUp = (): void => setDrag(null);

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, floor, getGridPoint]);

  const addRoom = (): void => {
    const newRoom: Room = {
      id: uid("room"),
      name: `部屋${currentRooms.length + 1}`,
      category: "room",
      x: 0,
      y: 0,
      w: 3,
      h: 3,
    };
    setRooms((state) => ({ ...state, [floor]: [...state[floor], newRoom] }));
    setSelectedRoomId(newRoom.id);
    setSelectedDoorId(null);
    showToast("部屋を追加しました");
  };

  const deleteRoom = (): void => {
    if (!selectedRoomId) return;
    setRooms((state) => ({
      ...state,
      [floor]: state[floor].filter((room) => room.id !== selectedRoomId),
    }));
    setSelectedRoomId(null);
    showToast("部屋を削除しました");
  };

  const deleteDoor = (): void => {
    if (!selectedDoorId) return;
    setDoors((state) => ({
      ...state,
      [floor]: state[floor].filter((door) => door.id !== selectedDoorId),
    }));
    setSelectedDoorId(null);
    showToast("扉を削除しました");
  };

  const rotateRoom = (): void => {
    if (!selectedRoomId) return;
    setRooms((state) => ({
      ...state,
      [floor]: state[floor].map((room) => {
        if (room.id !== selectedRoomId) return room;
        if (room.x + room.h > GRID_W || room.y + room.w > GRID_H) return room;
        return { ...room, w: room.h, h: room.w };
      }),
    }));
  };

  const resizeRoom = (dw: number, dh: number): void => {
    if (!selectedRoomId) return;
    setRooms((state) => ({
      ...state,
      [floor]: state[floor].map((room) => {
        if (room.id !== selectedRoomId) return room;
        const w = clamp(room.w + dw, 1, GRID_W);
        const h = clamp(room.h + dh, 1, GRID_H);
        if (room.x + w > GRID_W || room.y + h > GRID_H) return room;
        return { ...room, w, h };
      }),
    }));
  };

  const addDoorOnCanvas = (event: React.MouseEvent<SVGSVGElement>): void => {
    if (mode === "room") {
      setSelectedRoomId(null);
      setSelectedDoorId(null);
      return;
    }

    const point = getGridPoint(event.clientX, event.clientY);
    const newDoor: Door = {
      id: uid("door"),
      x: clamp(snap(point.x), 0, GRID_W),
      y: clamp(snap(point.y), 0, GRID_H),
      orient: brushOrient,
      type: brushType,
      width: brushWidth,
    };

    setDoors((state) => ({ ...state, [floor]: [...state[floor], newDoor] }));
    setSelectedDoorId(newDoor.id);
    setSelectedRoomId(null);
    showToast("扉を追加しました");
  };

  const exportJson = (): void => {
    const payload: SavedState = { version: 1, rooms, doors };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "間取りデータ.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("JSONを書き出しました");
  };

  const importJson = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as SavedState;
        if (parsed.version !== 1) throw new Error("invalid");
        setRooms(deepClone(parsed.rooms));
        setDoors(deepClone(parsed.doors));
        setSelectedRoomId(null);
        setSelectedDoorId(null);
        showToast("JSONを読み込みました");
      } catch {
        showToast("JSONの形式が正しくありません");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}

      <header className="head">
        <h1>間取りシミュレータ FloorPlanly</h1>
        <p>
          {floor}F / 合計 {totalTatami.toFixed(1)} 帖
        </p>
      </header>

      <div className="tools">
        <button
          className={floor === 1 ? "on" : ""}
          onClick={() => {
            setFloor(1);
            setSelectedRoomId(null);
            setSelectedDoorId(null);
          }}
        >
          1F
        </button>
        <button
          className={floor === 2 ? "on" : ""}
          onClick={() => {
            setFloor(2);
            setSelectedRoomId(null);
            setSelectedDoorId(null);
          }}
        >
          2F
        </button>

        <button
          className={mode === "room" ? "on" : ""}
          onClick={() => {
            setMode("room");
            setSelectedDoorId(null);
          }}
        >
          部屋モード
        </button>
        <button
          className={mode === "door" ? "on" : ""}
          onClick={() => {
            setMode("door");
            setSelectedRoomId(null);
          }}
        >
          扉モード
        </button>

        <button onClick={addRoom}>部屋を追加</button>
        <button onClick={deleteRoom} disabled={!selectedRoom}>
          部屋を削除
        </button>
        <button onClick={deleteDoor} disabled={!selectedDoor}>
          扉を削除
        </button>

        <button onClick={exportJson}>JSON書き出し</button>
        <button onClick={() => fileRef.current?.click()}>JSON読み込み</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importJson(file);
            event.target.value = "";
          }}
        />
      </div>

      <main className="main">
        <section className="canvasWrap">
          <svg
            ref={svgRef}
            className="canvas"
            width={CANVAS_W}
            height={CANVAS_H}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            onClick={addDoorOnCanvas}
          >
            {Array.from({ length: GRID_W + 1 }).map((_, i) => (
              <line
                key={`x-${i}`}
                x1={i * CELL}
                y1={0}
                x2={i * CELL}
                y2={CANVAS_H}
                stroke="rgba(138,167,184,.35)"
                strokeWidth="1"
              />
            ))}
            {Array.from({ length: GRID_H + 1 }).map((_, i) => (
              <line
                key={`y-${i}`}
                x1={0}
                y1={i * CELL}
                x2={CANVAS_W}
                y2={i * CELL}
                stroke="rgba(138,167,184,.35)"
                strokeWidth="1"
              />
            ))}

            {currentRooms.map((room) => {
              const x = room.x * CELL;
              const y = room.y * CELL;
              const w = room.w * CELL;
              const h = room.h * CELL;
              const selected = selectedRoomId === room.id;
              return (
                <g
                  key={room.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedRoomId(room.id);
                    setSelectedDoorId(null);
                  }}
                  onPointerDown={(event) => {
                    if (mode !== "room") return;
                    event.stopPropagation();
                    const point = getGridPoint(event.clientX, event.clientY);
                    setDrag({ kind: "room", id: room.id, ox: point.x - room.x, oy: point.y - room.y });
                    setSelectedRoomId(room.id);
                    setSelectedDoorId(null);
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={6}
                    fill={CATEGORY_COLORS[room.category]}
                    stroke={overlaps.has(room.id) ? "#d23f3f" : selected ? "#4fd0ff" : "rgba(227,238,245,.65)"}
                    strokeWidth={selected ? 3 : 2}
                  />
                  <text x={x + w / 2} y={y + h / 2 - 6} textAnchor="middle" className="name">
                    {room.name}
                  </text>
                  <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" className="sub">
                    {(room.w * room.h / 2).toFixed(1)} 帖
                  </text>
                </g>
              );
            })}

            {currentDoors.map((door) => {
              const x = door.x * CELL;
              const y = door.y * CELL;
              const len = (door.width * CELL) / 2;
              const selected = selectedDoorId === door.id;
              return (
                <g
                  key={door.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedDoorId(door.id);
                    setSelectedRoomId(null);
                  }}
                  onPointerDown={(event) => {
                    if (mode !== "door") return;
                    event.stopPropagation();
                    const point = getGridPoint(event.clientX, event.clientY);
                    setDrag({ kind: "door", id: door.id, ox: point.x - door.x, oy: point.y - door.y });
                    setSelectedDoorId(door.id);
                    setSelectedRoomId(null);
                  }}
                >
                  <rect
                    x={door.orient === "h" ? x - 4 : x - 6}
                    y={door.orient === "h" ? y - 6 : y - 4}
                    width={door.orient === "h" ? len + 10 : 12}
                    height={door.orient === "h" ? 12 : len + 10}
                    fill="rgba(255,255,255,.02)"
                  />
                  {door.orient === "h" ? (
                    <line
                      x1={x}
                      y1={y}
                      x2={x + len}
                      y2={y}
                      stroke={selected ? "#4fd0ff" : "#ffe5b1"}
                      strokeWidth={selected ? 2 : 1.4}
                    />
                  ) : (
                    <line
                      x1={x}
                      y1={y}
                      x2={x}
                      y2={y + len}
                      stroke={selected ? "#4fd0ff" : "#ffe5b1"}
                      strokeWidth={selected ? 2 : 1.4}
                    />
                  )}
                </g>
              );
            })}

            <rect
              x={1}
              y={1}
              width={CANVAS_W - 2}
              height={CANVAS_H - 2}
              fill="none"
              stroke="rgba(216,235,247,.35)"
              strokeWidth={2}
              rx={9}
            />
          </svg>
        </section>

        <aside className="side">
          <h2>編集パネル</h2>
          {mode === "room" ? (
            selectedRoom ? (
              <div className="card">
                <label>
                  部屋名
                  <input
                    value={selectedRoom.name}
                    onChange={(event) =>
                      setRooms((state) => ({
                        ...state,
                        [floor]: state[floor].map((room) =>
                          room.id === selectedRoom.id ? { ...room, name: event.target.value } : room,
                        ),
                      }))
                    }
                  />
                </label>

                <label>
                  種別
                  <select
                    value={selectedRoom.category}
                    onChange={(event) =>
                      setRooms((state) => ({
                        ...state,
                        [floor]: state[floor].map((room) =>
                          room.id === selectedRoom.id
                            ? { ...room, category: event.target.value as Category }
                            : room,
                        ),
                      }))
                    }
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </label>

                <p>
                  x:{selectedRoom.x} y:{selectedRoom.y} w:{selectedRoom.w} h:{selectedRoom.h}
                </p>

                <div className="row">
                  <button onClick={() => resizeRoom(1, 0)}>幅+</button>
                  <button onClick={() => resizeRoom(-1, 0)}>幅-</button>
                  <button onClick={() => resizeRoom(0, 1)}>奥行+</button>
                  <button onClick={() => resizeRoom(0, -1)}>奥行-</button>
                  <button onClick={rotateRoom}>回転</button>
                </div>
              </div>
            ) : (
              <div className="card">
                <p>部屋を選択すると編集できます。</p>
              </div>
            )
          ) : (
            <div className="card">
              <label>
                扉タイプ
                <select
                  value={brushType}
                  onChange={(event) => setBrushType(event.target.value as DoorType)}
                >
                  {DOOR_TYPES.map((doorType) => (
                    <option key={doorType} value={doorType}>
                      {DOOR_TYPE_LABELS[doorType]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                向き
                <select
                  value={brushOrient}
                  onChange={(event) => setBrushOrient(event.target.value as DoorOrient)}
                >
                  <option value="v">縦</option>
                  <option value="h">横</option>
                </select>
              </label>

              <label>
                幅
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={brushWidth}
                  onChange={(event) => setBrushWidth(Number(event.target.value) as 1 | 2 | 3 | 4)}
                />
              </label>

              {selectedDoor ? (
                <div>
                  <p>
                    x:{selectedDoor.x} y:{selectedDoor.y}
                  </p>

                  <label>
                    選択中タイプ
                    <select
                      value={selectedDoor.type}
                      onChange={(event) =>
                        setDoors((state) => ({
                          ...state,
                          [floor]: state[floor].map((door) =>
                            door.id === selectedDoor.id
                              ? { ...door, type: event.target.value as DoorType }
                              : door,
                          ),
                        }))
                      }
                    >
                      {DOOR_TYPES.map((doorType) => (
                        <option key={doorType} value={doorType}>
                          {DOOR_TYPE_LABELS[doorType]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    選択中の向き
                    <select
                      value={selectedDoor.orient}
                      onChange={(event) =>
                        setDoors((state) => ({
                          ...state,
                          [floor]: state[floor].map((door) =>
                            door.id === selectedDoor.id
                              ? { ...door, orient: event.target.value as DoorOrient }
                              : door,
                          ),
                        }))
                      }
                    >
                      <option value="v">縦</option>
                      <option value="h">横</option>
                    </select>
                  </label>

                  <label>
                    選択中の幅
                    <input
                      type="range"
                      min={1}
                      max={4}
                      step={1}
                      value={selectedDoor.width}
                      onChange={(event) =>
                        setDoors((state) => ({
                          ...state,
                          [floor]: state[floor].map((door) =>
                            door.id === selectedDoor.id
                              ? { ...door, width: Number(event.target.value) as 1 | 2 | 3 | 4 }
                              : door,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              ) : (
                <p>キャンバスをクリックすると扉を追加できます。</p>
              )}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
