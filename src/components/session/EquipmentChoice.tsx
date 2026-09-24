"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { listCustomEquipments } from "@/lib/db/repo";
import {
  equipmentLabel,
  isCustomEquipment,
  normalizeEquipment,
  NO_EQUIPMENT,
  PRESET_EQUIPMENTS,
  type Equipment,
} from "@/lib/db/schema";

/**
 * 기구 고르기. 누르는 즉시 확정된다 — 운동 중에 '확인' 버튼까지 한 번 더 누르게 하지 않는다.
 * 종목 추가 시트의 두 번째 단계와, 기록 카드에서 기구를 바꾸는 시트가 함께 쓴다.
 *
 * 목록에 없는 기구는 직접 적는다. 한 번 적은 이름은 다음부터 버튼으로 나온다.
 */
export function EquipmentChoice({
  current,
  currentNote,
  onChoose,
}: {
  /** 강조해 둘 기구 (지난번에 고른 것 / 지금 기록 중인 것) */
  current: Equipment;
  currentNote: string;
  onChoose: (equipment: Equipment) => void | Promise<void>;
}) {
  const customs = useLiveQuery(() => listCustomEquipments(), []);
  const [typed, setTyped] = useState("");

  // 종목에 기억된 기구가 직접 적은 것이면, 그 기록이 지워졌어도 선택지에 남긴다
  const customOptions = [
    ...(isCustomEquipment(current) && !customs?.includes(current) ? [current] : []),
    ...(customs ?? []),
  ];
  const options: Equipment[] = [
    ...PRESET_EQUIPMENTS.map((p) => p.key),
    ...customOptions,
    NO_EQUIPMENT,
  ];

  const submitTyped = async () => {
    const equipment = normalizeEquipment(typed);
    if (equipment === null) return;
    await onChoose(equipment);
  };

  return (
    <div className="space-y-2 p-4">
      <ul className="space-y-2">
        {options.map((key) => {
          const active = key === current;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onChoose(key)}
                className={`flex h-13 w-full items-center gap-3 rounded-xl border px-4 text-left transition active:bg-surface-2 ${
                  active ? "border-accent bg-surface-2" : "border-border"
                }`}
              >
                <span className="flex-1 truncate text-[15px] font-medium">
                  {equipmentLabel(key)}
                </span>
                {active ? (
                  <span className="flex items-center gap-1 text-xs text-accent">
                    <Check size={14} />
                    {currentNote}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <form
        className="flex gap-2 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          void submitTyped();
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="기구 직접 입력"
          placeholder="직접 입력 (예: 케틀벨, 스미스머신)"
          maxLength={20}
          enterKeyHint="done"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-base outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={!typed.trim()}
          className="h-12 shrink-0 rounded-xl bg-text px-4 text-sm font-semibold text-bg disabled:opacity-40"
        >
          사용
        </button>
      </form>

      <p className="px-1 pt-1 text-xs leading-relaxed text-muted">
        무게 ± 버튼의 증감폭과 지난 기록 불러오기에 쓰입니다. 볼륨 계산은 달라지지
        않습니다.
      </p>
    </div>
  );
}
