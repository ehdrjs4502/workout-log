import type { TrendPoint } from "./history";
import { fromDateKey } from "@/lib/format/date";

/**
 * 꺾은선의 좌표 계산. 그리는 건 TrendChart 가 하고, 여기는 순수 계산만 한다
 * (volume.ts 와 같은 구실 — 화면 없이도 검증할 수 있어야 하는 코드).
 *
 * 좌표계는 SVG viewBox 고정 크기다. 컨테이너가 max-w-md 라 가로 왜곡은 무시할 수준이고,
 * 선 두께는 vector-effect 로 따로 붙들어 둔다.
 */
export const CHART = {
  w: 320,
  h: 116,
  pad: { l: 42, r: 10, t: 10, b: 18 },
} as const;

export const PLOT_W = CHART.w - CHART.pad.l - CHART.pad.r;
export const PLOT_H = CHART.h - CHART.pad.t - CHART.pad.b;

const at = (key: string) => fromDateKey(key).getTime();

/**
 * 날짜 비례 배치. 쉰 기간이 그래프에서도 빈 구간으로 벌어져야 한다
 * (점을 등간격으로 늘어놓으면 주 3회와 월 1회가 똑같아 보인다).
 */
export function xPositions(points: TrendPoint[]): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [CHART.pad.l + PLOT_W / 2];

  const t0 = at(points[0].date);
  const span = at(points[points.length - 1].date) - t0;
  // 같은 날짜만 있으면 폭이 0 이라 나눗셈이 터진다 — 그때는 등간격으로 눕힌다
  if (span <= 0) {
    return points.map((_, i) => CHART.pad.l + (PLOT_W * i) / (points.length - 1));
  }
  return points.map((p) => CHART.pad.l + (PLOT_W * (at(p.date) - t0)) / span);
}

export type Scale = {
  /** 격자선을 그릴 값들 (위에서 아래 순) */
  ticks: number[];
  y: (value: number) => number;
};

/**
 * 0 부터 그리지 않는다. 1,900kg → 1,980kg 같은 변화가 보여야 하기 때문이다.
 * 값이 전부 같으면 폭이 0 이므로 가운데 수평선 하나로 눕힌다.
 */
export function scaleOf(values: number[]): Scale {
  if (values.length === 0) {
    return { ticks: [], y: () => CHART.pad.t + PLOT_H / 2 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return { ticks: [min], y: () => CHART.pad.t + PLOT_H / 2 };
  }

  const pad = (max - min) * 0.1;
  const lo = min - pad;
  const hi = max + pad;
  return {
    ticks: [max, (max + min) / 2, min],
    y: (value) => CHART.pad.t + PLOT_H * (1 - (value - lo) / (hi - lo)),
  };
}

/**
 * 각 점의 터치 영역 — 이웃과의 중간까지 넓게 잡는다.
 * 8px 짜리 점을 정확히 눌러야 하는 그래프는 폰에서 못 쓴다.
 */
export function hitBands(xs: number[]): [from: number, to: number][] {
  return xs.map((x, i) => [
    i === 0 ? CHART.pad.l : (xs[i - 1] + x) / 2,
    i === xs.length - 1 ? CHART.w - CHART.pad.r : (x + xs[i + 1]) / 2,
  ]);
}
