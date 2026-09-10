"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { TrendPoint } from "@/lib/stats/history";
import {
  CHART,
  PLOT_H,
  hitBands,
  scaleOf,
  xPositions,
} from "@/lib/stats/chartScale";
import { fromDateKey } from "@/lib/format/date";

/**
 * 총 볼륨(kg) 과 총 횟수(회) 를 위아래 두 패널로 그린다.
 *
 * 한 그래프에 이중축으로 겹치지 않는 이유: 두 축의 눈금을 어디에 맞추느냐가
 * 전적으로 임의라서, 데이터에 없는 상관관계를 그림이 지어내게 된다.
 * 단위가 다른 두 값은 축을 나누는 게 아니라 그래프를 나눈다.
 *
 * 두 패널은 x축(날짜)과 선택된 점을 공유한다. 그래서 컴포넌트도 하나다.
 */

const compact = (n: number) =>
  n >= 10000 ? `${Math.round(n / 100) / 10}k` : Math.round(n).toLocaleString();

function Panel({
  title,
  points,
  xs,
  values,
  color,
  selected,
  onSelect,
  showXAxis,
}: {
  title: string;
  points: TrendPoint[];
  xs: number[];
  values: number[];
  color: string;
  selected: number;
  onSelect: (index: number) => void;
  showXAxis: boolean;
}) {
  const scale = scaleOf(values);
  const ys = values.map(scale.y);
  const bands = hitBands(xs);

  // 점이 빽빽하면 마커가 서로를 가린다. 그때는 선과 선택된 점만 남긴다.
  const showDots = points.length <= 20;

  const xLabels = showXAxis
    ? [
        0,
        ...(points.length > 2 ? [Math.floor((points.length - 1) / 2)] : []),
        ...(points.length > 1 ? [points.length - 1] : []),
      ]
    : [];
  const anchorOf = (i: number) =>
    i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";

  return (
    <div>
      <p className="px-1 text-xs text-muted">{title}</p>
      <svg
        viewBox={`0 0 ${CHART.w} ${CHART.h}`}
        className="w-full"
        style={{ height: CHART.h }}
        role="img"
        aria-label={title}
      >
        {/* 격자는 표면에서 한 단계만 뜬 실선 (점선은 임계선처럼 읽힌다) */}
        {scale.ticks.map((tick) => {
          const y = scale.y(tick);
          return (
            <g key={tick}>
              <line
                x1={CHART.pad.l}
                x2={CHART.w - CHART.pad.r}
                y1={y}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={CHART.pad.l - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={8}
                className="fill-muted tabular-nums"
              >
                {compact(tick)}
              </text>
            </g>
          );
        })}

        {/* 선택된 날짜의 십자선 */}
        {xs[selected] !== undefined ? (
          <line
            x1={xs[selected]}
            x2={xs[selected]}
            y1={CHART.pad.t}
            y2={CHART.pad.t + PLOT_H}
            stroke="var(--color-border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {points.length > 1 ? (
          <polyline
            points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {showDots
          ? xs.map((x, i) => (
              <circle key={points[i].date} cx={x} cy={ys[i]} r={2.5} fill={color} />
            ))
          : null}

        {/* 선택된 점은 배경색 링을 둘러 선 위에서도 떠 보이게 한다 */}
        {xs[selected] !== undefined ? (
          <circle
            cx={xs[selected]}
            cy={ys[selected]}
            r={4}
            fill={color}
            stroke="var(--color-bg)"
            strokeWidth={2}
          />
        ) : null}

        {xLabels.map((i) => (
          <text
            key={points[i].date}
            x={xs[i]}
            y={CHART.h - 5}
            textAnchor={anchorOf(i)}
            fontSize={8}
            className="fill-muted tabular-nums"
          >
            {format(fromDateKey(points[i].date), "M/d")}
          </text>
        ))}

        {bands.map(([from, to], i) => (
          <rect
            key={points[i].date}
            x={from}
            y={0}
            width={Math.max(to - from, 1)}
            height={CHART.h}
            fill="transparent"
            onClick={() => onSelect(i)}
          />
        ))}
      </svg>
    </div>
  );
}

export function TrendChart({
  points,
  color,
}: {
  points: TrendPoint[];
  color: string;
}) {
  // 아무것도 안 골랐으면 가장 최근 점 — 늘 읽을 값이 하나는 있어야 자리가 안 흔들린다
  const [picked, setPicked] = useState<number | null>(null);

  // 기간이나 종목이 바뀌면 고른 자리를 놓는다. 인덱스만 남으면 3번째 점이
  // 전혀 다른 날짜를 가리키게 된다 (SetInputPanel 이 쓰는 것과 같은 방식).
  const signature = `${points.length}|${points[0]?.date}|${points.at(-1)?.date}`;
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setPicked(null);
  }

  const selected = Math.min(picked ?? points.length - 1, points.length - 1);
  const xs = xPositions(points);
  const current = points[selected];

  if (points.length === 0) return null;

  return (
    <div className="space-y-2">
      <Panel
        title="총 볼륨 (kg)"
        points={points}
        xs={xs}
        values={points.map((p) => p.volume)}
        color={color}
        selected={selected}
        onSelect={setPicked}
        showXAxis={false}
      />
      <Panel
        title="총 횟수 (회)"
        points={points}
        xs={xs}
        values={points.map((p) => p.reps)}
        color={color}
        selected={selected}
        onSelect={setPicked}
        showXAxis
      />

      <p className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm tabular-nums">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="text-muted">
          {format(fromDateKey(current.date), "M월 d일")}
        </span>
        <span className="ml-auto">
          {Math.round(current.volume).toLocaleString()}kg · {current.reps}회
        </span>
      </p>
    </div>
  );
}
