"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Reading = {
  date: string;
  waterLevel: number;
  rate: number;
};

type MonthCoverage = {
  key: string;
  label: string;
  actual: number;
  expected: number;
  coverage: number;
};

type ReservoirData = {
  source: "sample" | "krc";
  reservoir: {
    key: string;
    code: string;
    name: string;
    apiName: string;
    county: string;
    region: string;
    reason: string;
  };
  current: Reading;
  series: Reading[];
  history: Reading[];
  status: {
    label: string;
    tone: "safe" | "normal" | "caution" | "danger";
    action: string;
  };
  trend: {
    label: string;
    delta: number;
  };
  diagnostics: {
    summary: {
      requestedDays: number;
      uniqueDays: number;
      coverageRate: number;
      missingDays: number;
      missingRate: number;
      duplicateDays: number;
      invalidValues: number;
      latestDate: string;
      lagDays: number;
      abruptChanges: number;
      abruptThreshold: number;
      longestFlatRun: number;
    };
    months: MonthCoverage[];
    verdict: {
      level: "ready" | "short" | "diagnostic";
      title: string;
      note: string;
    };
    requestedFrom: string;
    requestedTo: string;
    standard: string;
  };
  forecast: {
    version: string;
    status: string;
    baseline: string;
    releaseRule: string;
    leakageGuard: string;
    weather: {
      connected: boolean;
      source: string;
      model: string;
      latitude: number;
      longitude: number;
      historyCoverageRate: number;
      oneDayRain: number | null;
      threeDayRain: number | null;
      outlook: Array<{
        date: string;
        rainfall: number;
        weatherCode: number;
        label: string;
      }>;
      summary: string;
      action: string;
      note: string;
    };
    horizons: Array<{
      horizon: 1 | 3;
      forecastDate: string;
      predictedRate: number;
      change: number;
      interval: {
        lower: number;
        upper: number;
        coverage: number;
      };
      decision: "pass" | "hold";
      adoption: "weather" | "water" | "hold";
      decisionLabel: string;
      reason: string;
      rainfallForecast: number | null;
      model: {
        key: string;
        label: string;
      };
      weatherModel: {
        key: string;
        label: string;
      };
      backtest: {
        selectionTests: number;
        tests: number;
        periodStart: string;
        periodEnd: string;
        baselineMae: number;
        waterMae: number;
        modelMae: number | null;
        waterImprovementPct: number;
        improvementPct: number | null;
        weatherGainPct: number | null;
      };
    }>;
  };
  fetchedAt: string;
};

const RESERVOIR_OPTIONS = [
  { key: "idong", name: "이동저수지", location: "경기 용인", region: "수도권" },
  { key: "tapjeong", name: "탑정저수지", location: "충남 논산", region: "충청" },
  { key: "naju", name: "나주호", location: "전남 나주", region: "호남" },
  { key: "seongju", name: "성주저수지", location: "경북 성주", region: "영남 내륙" },
  { key: "hadong", name: "하동저수지", location: "경남 하동", region: "남해안" },
] as const;

type CropKey = "rice" | "field" | "orchard" | "greenhouse";
type StageKey = "rooting" | "growth" | "flowering" | "preharvest";
type MoistureKey = "wet" | "normal" | "dry";

type FarmProfile = {
  crop: CropKey;
  stage: StageKey;
  moisture: MoistureKey;
};

const FARM_PROFILE_STORAGE_KEY = "multtae-farm-profile-v1";

const CROP_OPTIONS: Array<{ key: CropKey; label: string }> = [
  { key: "rice", label: "논벼" },
  { key: "field", label: "밭작물" },
  { key: "orchard", label: "과수" },
  { key: "greenhouse", label: "시설채소" },
];

const STAGE_OPTIONS: Array<{ key: StageKey; label: string }> = [
  { key: "rooting", label: "활착·유묘기" },
  { key: "growth", label: "생육기" },
  { key: "flowering", label: "개화·결실기" },
  { key: "preharvest", label: "수확 전" },
];

const MOISTURE_OPTIONS: Array<{ key: MoistureKey; label: string }> = [
  { key: "wet", label: "젖어 있음" },
  { key: "normal", label: "적당함" },
  { key: "dry", label: "말라 있음" },
];

const DEFAULT_FARM_PROFILE: FarmProfile = {
  crop: "rice",
  stage: "growth",
  moisture: "normal",
};

function isFarmProfile(value: unknown): value is FarmProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<FarmProfile>;
  return (
    CROP_OPTIONS.some((item) => item.key === profile.crop) &&
    STAGE_OPTIONS.some((item) => item.key === profile.stage) &&
    MOISTURE_OPTIONS.some((item) => item.key === profile.moisture)
  );
}

function shortDate(value: string) {
  if (value.length !== 8) return value;
  return `${Number(value.slice(4, 6))}/${Number(value.slice(6, 8))}`;
}

function fullDate(value: string) {
  if (value.length !== 8) return value || "확인 필요";
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%p`;
}

function WaterMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 56 56" aria-hidden="true" focusable="false">
      <path
        d="M28 5C21 15 13 23 13 34a15 15 0 0 0 30 0C43 23 35 15 28 5Z"
        fill="currentColor"
      />
      <path
        d="M19 35c3 3 6 4 9 4s6-1 9-4"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="3"
        opacity=".82"
      />
    </svg>
  );
}

function LeafMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 41V21" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
      <path d="M23 27C13 27 7 21 7 11c10 0 16 6 16 16Z" fill="currentColor" opacity=".76" />
      <path d="M26 22C27 12 33 7 42 7c0 10-6 15-16 15Z" fill="currentColor" />
    </svg>
  );
}

function TrendChart({ series }: { series: Reading[] }) {
  const chart = useMemo(() => {
    const width = 620;
    const height = 190;
    const left = 38;
    const right = 18;
    const top = 20;
    const bottom = 38;
    const rates = series.map((item) => item.rate);
    const rawMin = Math.min(...rates);
    const rawMax = Math.max(...rates);
    const padding = Math.max(4, (rawMax - rawMin) * 0.7);
    const min = Math.max(0, Math.floor((rawMin - padding) / 5) * 5);
    const max = Math.min(100, Math.ceil((rawMax + padding) / 5) * 5);
    const range = Math.max(10, max - min);
    const points = series.map((item, index) => {
      const x =
        series.length === 1
          ? width / 2
          : left + (index * (width - left - right)) / (series.length - 1);
      const y = top + ((max - item.rate) / range) * (height - top - bottom);
      return { ...item, x, y };
    });
    const line = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" ");
    const area = `${line} L${points.at(-1)?.x ?? left},${height - bottom} L${points[0]?.x ?? left},${height - bottom} Z`;
    const grid = [0, 0.5, 1].map((ratio) => ({
      y: top + ratio * (height - top - bottom),
      label: `${Math.round(max - ratio * range)}%`,
    }));
    return { width, height, points, line, area, grid };
  }, [series]);

  return (
    <div className="trend-chart-wrap">
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label={`최근 ${series.length}일 저수율 변화`}
      >
        <defs>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2899d7" stopOpacity=".28" />
            <stop offset="1" stopColor="#2899d7" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {chart.grid.map((line) => (
          <g key={line.y}>
            <line className="chart-grid" x1="38" x2="602" y1={line.y} y2={line.y} />
            <text className="chart-y-label" x="2" y={line.y + 4}>{line.label}</text>
          </g>
        ))}
        <path d={chart.area} fill="url(#trendArea)" />
        <path className="chart-line" d={chart.line} />
        {chart.points.map((point, index) => (
          <g key={point.date}>
            <circle
              className={index === chart.points.length - 1 ? "chart-point is-last" : "chart-point"}
              cx={point.x}
              cy={point.y}
              r={index === chart.points.length - 1 ? 5.5 : 4}
            >
              <title>{`${fullDate(point.date)} · ${point.rate.toFixed(1)}%`}</title>
            </circle>
            <text className="chart-x-label" x={point.x} y={chart.height - 12} textAnchor="middle">
              {shortDate(point.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function HistoryChart({ series }: { series: Reading[] }) {
  const chart = useMemo(() => {
    const width = 980;
    const height = 220;
    const left = 38;
    const right = 14;
    const top = 20;
    const bottom = 34;
    const rates = series.map((item) => item.rate);
    const rawMin = Math.min(...rates);
    const rawMax = Math.max(...rates);
    const padding = Math.max(5, (rawMax - rawMin) * 0.16);
    const min = Math.max(0, Math.floor((rawMin - padding) / 10) * 10);
    const max = Math.min(100, Math.ceil((rawMax + padding) / 10) * 10);
    const range = Math.max(10, max - min);
    const points = series.map((item, index) => ({
      ...item,
      x: left + (index * (width - left - right)) / Math.max(1, series.length - 1),
      y: top + ((max - item.rate) / range) * (height - top - bottom),
    }));
    const line = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(" ");
    return { width, height, left, right, top, bottom, min, max, line };
  }, [series]);

  return (
    <div className="history-chart-wrap">
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="최근 365일 저수율 흐름">
        <defs>
          <linearGradient id="historyStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#36a7dc" />
            <stop offset=".55" stopColor="#1479bd" />
            <stop offset="1" stopColor="#168c78" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const y = chart.top + ratio * (chart.height - chart.top - chart.bottom);
          const label = Math.round(chart.max - ratio * (chart.max - chart.min));
          return (
            <g key={ratio}>
              <line className="history-grid" x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} />
              <text className="chart-y-label" x="2" y={y + 4}>{label}%</text>
            </g>
          );
        })}
        <path className="history-line" d={chart.line} />
        <text className="history-date" x={chart.left} y={chart.height - 8}>{fullDate(series[0]?.date ?? "")}</text>
        <text className="history-date" x={chart.width - chart.right} y={chart.height - 8} textAnchor="end">
          {fullDate(series.at(-1)?.date ?? "")}
        </text>
      </svg>
    </div>
  );
}

function LoadingPanel() {
  return (
    <section className="loading-panel" aria-label="365일 데이터 불러오는 중">
      <span className="loader-drop"><WaterMark /></span>
      <div>
        <strong>365일 기록을 진단하고 있어요</strong>
        <p>과거 강수예보와 1일·3일 순차 백테스트를 함께 맞추고 있습니다.</p>
      </div>
    </section>
  );
}

type FarmAction = {
  tone: "rain" | "watch" | "pause" | "prepare" | "steady";
  eyebrow: string;
  title: string;
  lead: string;
  steps: [string, string, string];
  confidence: string;
  confidenceNote: string;
  forecastLabel: string;
};

type FeedbackVerdict = "match" | "different";
type FeedbackReason = "rain" | "moisture" | "supply" | "crop" | "other";
type FeedbackClarity = "easy" | "okay" | "hard";

type ActualRainKey = "none" | "light" | "heavy" | "unknown";
type ActionTakenKey = "followed" | "adjusted" | "skipped";
type HelpfulnessKey = "helpful" | "mixed" | "not_helpful";

type ActionLogRecord = {
  id: string;
  status: "pending" | "completed";
  reservoirKey: string;
  reservoirName: string;
  observationDate: string;
  actionTitle: string;
  actionTone: string;
  crop: CropKey;
  stage: StageKey;
  initialMoisture: MoistureKey;
  currentRate: number;
  waterStatus: string;
  threeDayRain: number | null;
  actualRain: ActualRainKey | null;
  nextMoisture: MoistureKey | null;
  actionTaken: ActionTakenKey | null;
  helpfulness: HelpfulnessKey | null;
  createdAt: string;
  completedAt: string | null;
};

type ActionLogSummary = {
  total: number;
  participants: number;
  completed: number;
  pending: number;
  completionRate: number;
  helpfulRate: number;
  adjusted: number;
};

const EMPTY_ACTION_LOG_SUMMARY: ActionLogSummary = {
  total: 0,
  participants: 0,
  completed: 0,
  pending: 0,
  completionRate: 0,
  helpfulRate: 0,
  adjusted: 0,
};

const ACTUAL_RAIN_OPTIONS: Array<{ key: ActualRainKey; label: string }> = [
  { key: "none", label: "비 안 옴" },
  { key: "light", label: "조금 옴" },
  { key: "heavy", label: "많이 옴" },
  { key: "unknown", label: "잘 모르겠음" },
];

const ACTION_TAKEN_OPTIONS: Array<{
  key: ActionTakenKey;
  label: string;
  note: string;
}> = [
  { key: "followed", label: "안내대로 확인", note: "카드의 확인 순서를 따랐어요" },
  { key: "adjusted", label: "현장에 맞게 조정", note: "농장 상황에 맞춰 바꿨어요" },
  { key: "skipped", label: "따르지 않음", note: "다른 판단을 했어요" },
];

const HELPFULNESS_OPTIONS: Array<{ key: HelpfulnessKey; label: string }> = [
  { key: "helpful", label: "도움됨" },
  { key: "mixed", label: "보통" },
  { key: "not_helpful", label: "도움 안 됨" },
];

type FeedbackReport = {
  total: number;
  participants: number;
  matchRate: number;
  easyRate: number;
  counts: {
    matching: number;
    different: number;
    easy: number;
    okay: number;
    hard: number;
    krc: number;
  };
  period: {
    firstRecordedAt: string | null;
    lastRecordedAt: string | null;
  };
  reasons: Array<{ reason: string | null; total: number }>;
  coverage: {
    reservoirs: Array<{ key: string; label: string; total: number }>;
    crops: Array<{ key: string; total: number }>;
    stages: Array<{ key: string; total: number }>;
    moisture: Array<{ key: string; total: number }>;
  };
};

type FeedbackCohort = FeedbackReport & {
  target: number;
  frozen: boolean;
};

type FeedbackSummary = FeedbackReport & {
  firstCohort: FeedbackCohort | null;
};

const PARTICIPANT_STORAGE_KEY = "multtae-anonymous-participant-v1";

const FEEDBACK_REASONS: Array<{ key: FeedbackReason; label: string }> = [
  { key: "rain", label: "실제 비가 예보와 달랐어요" },
  { key: "moisture", label: "포장 수분 판단이 달랐어요" },
  { key: "supply", label: "급수 일정·공급 상황이 달랐어요" },
  { key: "crop", label: "작물 상태와 맞지 않았어요" },
  { key: "other", label: "그 밖의 이유" },
];

const FEEDBACK_CLARITY: Array<{
  key: FeedbackClarity;
  label: string;
  note: string;
}> = [
  { key: "easy", label: "바로 이해됨", note: "무엇을 할지 바로 알았어요" },
  { key: "okay", label: "조금 생각 필요", note: "읽으면 이해할 수 있어요" },
  { key: "hard", label: "이해하기 어려움", note: "표현을 더 쉽게 바꿔야 해요" },
];

const EMPTY_FEEDBACK_SUMMARY: FeedbackSummary = {
  total: 0,
  participants: 0,
  matchRate: 0,
  easyRate: 0,
  counts: {
    matching: 0,
    different: 0,
    easy: 0,
    okay: 0,
    hard: 0,
    krc: 0,
  },
  period: {
    firstRecordedAt: null,
    lastRecordedAt: null,
  },
  reasons: [],
  coverage: {
    reservoirs: [],
    crops: [],
    stages: [],
    moisture: [],
  },
  firstCohort: null,
};

const CROP_CHECKS: Record<CropKey, string> = {
  rice: "논두렁 누수와 담수 상태를 한 바퀴 확인하세요.",
  field: "이랑 사이 배수와 뿌리 주변 흙을 손으로 확인하세요.",
  orchard: "나무 아래 뿌리층 수분과 어린 과실·잎의 처짐을 확인하세요.",
  greenhouse: "근권·배지 수분과 하우스 안 온도를 함께 확인하세요.",
};

const STAGE_CHECKS: Record<StageKey, string> = {
  rooting: "활착기에는 갑작스러운 건조·과습 변화를 피하고 뿌리 상태를 살피세요.",
  growth: "생육기에는 잎의 처짐과 뿌리 주변 수분 변화를 함께 기록하세요.",
  flowering: "개화·결실기에는 수분 스트레스가 없는지 관수 일정 전에 먼저 확인하세요.",
  preharvest: "수확 전 물관리는 작물·품종별 차이가 크므로 지역 농업기술센터 기준을 우선하세요.",
};

function buildFarmAction(data: ReservoirData, profile: FarmProfile): FarmAction {
  const rain = data.forecast.weather.threeDayRain;
  const threeDay = data.forecast.horizons.find((item) => item.horizon === 3);
  const forecastLabel = !threeDay || threeDay.decision === "hold"
    ? "3일 예측 공개 보류"
    : threeDay.adoption === "weather"
      ? "날씨 결합 예측 채택"
      : "검증된 수위 예측 유지";
  const hasDecisionData =
    data.source === "krc" &&
    data.forecast.weather.connected &&
    rain !== null &&
    threeDay?.decision === "pass";
  const confidence = hasDecisionData ? "자료 충분 · 현장 확인 병행" : "현장 확인 우선";
  const confidenceNote = hasDecisionData
    ? "KRC 실데이터와 강수예보, 공개 가능한 3일 예측을 함께 봤습니다."
    : "비 예보 또는 3일 예측이 충분하지 않아 현장 상태를 더 중요하게 봐야 합니다.";
  const cropCheck = CROP_CHECKS[profile.crop];
  const stageCheck = STAGE_CHECKS[profile.stage];

  if (!data.forecast.weather.connected || rain === null) {
    return {
      tone: "watch",
      eyebrow: "예보 연결 확인",
      title: "강수예보 확인 전, 현장 수분부터 점검",
      lead: "비 예보가 아직 연결되지 않았습니다. 지금은 물주기를 단정하지 않고 포장 상태부터 확인하는 편이 안전합니다.",
      steps: ["관수 전 기상예보와 관할 급수 안내를 다시 확인하세요.", cropCheck, stageCheck],
      confidence,
      confidenceNote,
      forecastLabel,
    };
  }

  if (rain >= 30) {
    return {
      tone: "rain",
      eyebrow: `3일 비 ${rain.toFixed(1)}mm`,
      title: "관수보다 배수·침수 점검을 먼저",
      lead: `${data.reservoir.name} 주변에 많은 비가 예상됩니다. 추가 물주기보다 물이 빠질 길과 낮은 곳의 고임을 먼저 살펴보세요.`,
      steps: ["배수로 막힘과 포장의 낮은 곳을 비가 오기 전에 확인하세요.", cropCheck, "비가 지난 뒤 뿌리 주변 수분을 다시 보고 관수 여부를 정하세요."],
      confidence,
      confidenceNote,
      forecastLabel,
    };
  }

  if (rain >= 10) {
    return {
      tone: "watch",
      eyebrow: `3일 비 ${rain.toFixed(1)}mm`,
      title: "비가 온 뒤 토양을 보고 관수 결정",
      lead: "관수량을 미리 확정하기보다 실제로 내린 비와 포장 수분을 확인한 뒤 일정을 조정하세요.",
      steps: ["지금 일괄 관수하지 말고 비가 지난 뒤 수분 상태를 다시 확인하세요.", cropCheck, stageCheck],
      confidence,
      confidenceNote,
      forecastLabel,
    };
  }

  if (profile.moisture === "wet") {
    return {
      tone: "pause",
      eyebrow: "포장 수분 · 젖음",
      title: "지금은 추가 관수보다 과습 확인",
      lead: `3일 예상 강수는 ${rain.toFixed(1)}mm이지만 포장이 이미 젖어 있습니다. 뿌리 주변 산소 부족과 물고임부터 살펴보세요.`,
      steps: ["고인 물과 배수 불량 지점을 먼저 확인하세요.", cropCheck, stageCheck],
      confidence,
      confidenceNote,
      forecastLabel,
    };
  }

  if (profile.moisture === "dry" && rain < 5) {
    const waterIsTight = data.status.tone === "caution" || data.status.tone === "danger";
    return waterIsTight
      ? {
          tone: "watch",
          eyebrow: `${data.status.label} · 포장 건조`,
          title: "공급 안내와 관수 우선순위를 먼저 확인",
          lead: `포장은 말라 있지만 ${data.reservoir.name}의 저수율 상태는 ‘${data.status.label}’입니다. 관할 급수 안내를 확인한 뒤 꼭 필요한 구역부터 판단하세요.`,
          steps: ["관할 KRC 지사·용수관리 안내와 공급 일정을 먼저 확인하세요.", cropCheck, stageCheck],
          confidence,
          confidenceNote,
          forecastLabel,
        }
      : {
          tone: "prepare",
          eyebrow: `3일 비 ${rain.toFixed(1)}mm · 포장 건조`,
          title: "오늘 현장 수분 확인 후 관수 준비",
          lead: "큰 비가 예상되지 않고 포장이 말라 있습니다. 다만 화면만 보고 바로 물을 주지 말고 뿌리 주변 상태를 확인하세요.",
          steps: ["뿌리 주변 흙을 직접 확인하고 작물별 관수 기준과 비교하세요.", cropCheck, stageCheck],
          confidence,
          confidenceNote,
          forecastLabel,
        };
  }

  return {
    tone: "steady",
    eyebrow: `3일 비 ${rain.toFixed(1)}mm · 수분 적정`,
    title: "현재 계획 유지, 내일 다시 확인",
    lead: "지금은 급하게 관수 일정을 바꿀 신호가 크지 않습니다. 같은 시간에 포장 상태를 다시 기록하면 다음 판단이 쉬워집니다.",
    steps: ["오늘 관수 계획은 유지하되 기상과 급수 안내 변화를 확인하세요.", cropCheck, stageCheck],
    confidence,
    confidenceNote,
    forecastLabel,
  };
}

function getAnonymousParticipantId() {
  try {
    const stored = window.localStorage.getItem(PARTICIPANT_STORAGE_KEY);
    if (stored && /^[a-zA-Z0-9-]{8,80}$/.test(stored)) return stored;
    const participantId = window.crypto.randomUUID();
    window.localStorage.setItem(PARTICIPANT_STORAGE_KEY, participantId);
    return participantId;
  } catch {
    return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const REPORT_CROP_LABELS: Record<string, string> = {
  rice: "논벼",
  field: "밭작물",
  orchard: "과수",
  greenhouse: "시설채소",
};

const REPORT_STAGE_LABELS: Record<string, string> = {
  rooting: "활착·유묘기",
  growth: "생육기",
  flowering: "개화·결실기",
  preharvest: "수확 전",
};

const REPORT_MOISTURE_LABELS: Record<string, string> = {
  wet: "젖어 있음",
  normal: "적당함",
  dry: "말라 있음",
};

function formatReportDate(value: string | null) {
  if (!value) return "집계 시점 확인 중";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10).replaceAll("-", ".");
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function ReportCoverageRow({
  label,
  items,
}: {
  label: string;
  items: Array<{ key: string; label: string; total: number }>;
}) {
  return (
    <div className="report-coverage-row">
      <strong>{label}</strong>
      <div>
        {items.length ? items.map((item) => (
          <span key={`${label}-${item.key}`}>{item.label}<small>{item.total}건</small></span>
        )) : <span>집계 자료 없음</span>}
      </div>
    </div>
  );
}

function ValidationReport({ summary }: { summary: FeedbackSummary }) {
  const report = summary.firstCohort;
  if (!report) return null;

  const krcRate = report.total > 0
    ? Math.round((report.counts.krc / report.total) * 100)
    : 0;
  const reservoirCoverage = report.coverage.reservoirs.map((item) => ({
    ...item,
    label: item.label,
  }));
  const cropCoverage = report.coverage.crops.map((item) => ({
    ...item,
    label: REPORT_CROP_LABELS[item.key] ?? item.key,
  }));
  const stageCoverage = report.coverage.stages.map((item) => ({
    ...item,
    label: REPORT_STAGE_LABELS[item.key] ?? item.key,
  }));
  const moistureCoverage = report.coverage.moisture.map((item) => ({
    ...item,
    label: REPORT_MOISTURE_LABELS[item.key] ?? item.key,
  }));
  const coveredReservoirs = new Set(summary.coverage.reservoirs.map((item) => item.key));
  const coveredCrops = new Set(summary.coverage.crops.map((item) => item.key));
  const missingReservoirs = RESERVOIR_OPTIONS.filter((item) => !coveredReservoirs.has(item.key));
  const missingCrops = CROP_OPTIONS.filter((item) => !coveredCrops.has(item.key));
  const secondTarget = 10;
  const secondProgress = Math.min(100, (summary.participants / secondTarget) * 100);
  const remainingParticipants = Math.max(0, secondTarget - summary.participants);
  const topReason = summary.reasons[0];
  const topReasonLabel = FEEDBACK_REASONS.find((item) => item.key === topReason?.reason)?.label;
  const gapLabels = [
    missingReservoirs.length
      ? `저수지 ${missingReservoirs.map((item) => item.name.replace("저수지", "")).join("·")}`
      : "",
    missingCrops.length ? `작물 ${missingCrops.map((item) => item.label).join("·")}` : "",
  ].filter(Boolean);
  const improvement = summary.counts.different > 0
    ? {
        title: "불일치 원인부터 보정",
        note: topReasonLabel
          ? `가장 많이 선택된 ‘${topReasonLabel}’ 항목을 다음 행동카드 규칙에 우선 반영합니다.`
          : "불일치 응답의 조건을 다시 확인해 행동카드 규칙을 보정합니다.",
      }
    : summary.easyRate < 100
      ? {
          title: "안내 문장을 더 짧게",
          note: "현장 판단은 유지하되 한 번에 이해되지 않은 표현부터 쉬운 말로 바꿉니다.",
        }
      : {
          title: "현재 규칙 유지·범위 확대",
          note: "아직 불일치와 난해 응답이 없어 행동카드는 유지하고 미검증 조건을 먼저 채웁니다.",
        };

  return (
    <section className="validation-report" id="validation-report" aria-labelledby="validation-report-title">
      <div className="report-heading">
        <div>
          <span className="report-badge"><span aria-hidden="true">✓</span> 첫 3명 표본 고정</span>
          <h3 id="validation-report-title">물살핌 농업인 1차 검증 고정판</h3>
          <p>{formatReportDate(report.period.lastRecordedAt)} 완료 · 후속 응답과 분리 · 익명 참여 · QA 기록 제외</p>
        </div>
        <button type="button" className="report-print-button" onClick={() => window.print()}>
          <span aria-hidden="true">▣</span> 리포트 인쇄·PDF 저장
        </button>
      </div>

      <div className="report-score-grid" aria-label="1차 현장검증 핵심 결과">
        <article>
          <span>검증 참여</span>
          <strong>{report.participants}<small>명</small></strong>
          <p>첫 3개 익명 기기 고정</p>
        </article>
        <article className="is-highlight">
          <span>행동카드 현장 일치</span>
          <strong>{report.matchRate}<small>%</small></strong>
          <p>{report.counts.matching}/{report.total}건 일치</p>
        </article>
        <article className="is-highlight">
          <span>문장 바로 이해</span>
          <strong>{report.easyRate}<small>%</small></strong>
          <p>{report.counts.easy}/{report.total}건 즉시 이해</p>
        </article>
        <article>
          <span>KRC 실데이터 기반</span>
          <strong>{krcRate}<small>%</small></strong>
          <p>{report.counts.krc}/{report.total}건 실데이터</p>
        </article>
      </div>

      <div className="report-detail-grid">
        <article className="report-method">
          <div className="report-subheading"><span>01</span><strong>검증 방법</strong></div>
          <ol>
            <li><span>대상</span><p>첫 농업인 {report.participants}명이 각자의 휴대폰으로 참여</p></li>
            <li><span>과제</span><p>저수지·작물·생육단계·포장 수분을 직접 선택한 뒤 행동카드 확인</p></li>
            <li><span>평가</span><p>현장 일치 여부와 안내 문장의 이해도를 구조화 문항으로 응답</p></li>
            <li><span>통제</span><p>동일 기기·조건 재응답은 기존 기록만 갱신하고, 첫 3명 이후 응답은 고정판과 분리</p></li>
          </ol>
        </article>

        <article className="report-coverage">
          <div className="report-subheading"><span>02</span><strong>검증 범위</strong></div>
          <ReportCoverageRow label="저수지" items={reservoirCoverage} />
          <ReportCoverageRow label="작물" items={cropCoverage} />
          <ReportCoverageRow label="생육단계" items={stageCoverage} />
          <ReportCoverageRow label="포장수분" items={moistureCoverage} />
        </article>
      </div>

      <div className="report-interpretation">
        <div className="report-subheading"><span>03</span><strong>결과 해석</strong></div>
        <div className="report-interpretation-copy">
          <p>
            <strong>
              {report.matchRate === 100 && report.easyRate === 100
                ? "1차 표본에서는 참여자 전원이 행동카드가 현장과 맞고, 무엇을 할지 바로 이해했다고 응답했습니다."
                : `첫 ${report.total}건 중 ${report.counts.matching}건이 현장과 일치했고, ${report.counts.easy}건은 문장을 바로 이해했다고 응답했습니다.`}
            </strong>
            이는 저수율을 보여주는 데서 끝나지 않고 농업인이 먼저 확인할 행동으로 번역하는 방향의 초기 타당성을 보여줍니다.
          </p>
          <div>
            <span>해석 원칙</span>
            <p>소표본 탐색검증이므로 일반화된 성능 입증이 아니라 <strong>초기 사용성 검증 통과</strong>로 한정합니다.</p>
          </div>
        </div>
      </div>

      <div className="report-improvement">
        <div className="report-subheading"><span>04</span><strong>데이터 기반 개선 결정</strong></div>
        <div className="report-improvement-grid">
          <article>
            <span>현재 결정</span>
            <strong>{improvement.title}</strong>
            <p>{improvement.note}</p>
          </article>
          <article>
            <span>증거 보존</span>
            <strong>1차 결과 자동 고정</strong>
            <p>2차 응답이 늘거나 결과가 달라져도 첫 3명의 수치와 검증 범위는 바뀌지 않습니다.</p>
          </article>
          <article>
            <span>다음 표본 공백</span>
            <strong>{gapLabels.length ? gapLabels.join(" / ") : "대표 조건 충족"}</strong>
            <p>{gapLabels.length ? "아직 다루지 않은 조건을 우선 모집해 편향을 줄입니다." : "대표 조건을 채웠으므로 불일치 사례를 중심으로 규칙을 보정합니다."}</p>
          </article>
        </div>
      </div>

      <div className="report-next-step">
        <div><span>2차 검증 진행률</span><strong>{summary.participants}<small>/10명</small></strong></div>
        <div className="report-next-progress">
          <div><span style={{ width: `${secondProgress}%` }} /></div>
          <p>{remainingParticipants ? `목표까지 ${remainingParticipants}명 · 미검증 조건 우선 모집` : "10명 목표 달성 · 결과 비교와 규칙 보정 단계"}</p>
        </div>
        <span className="report-version">물살핌 v0.8 · 검증 고정판</span>
      </div>
    </section>
  );
}

function optionLabel<Key extends string>(
  options: Array<{ key: Key; label: string }>,
  key: Key | null,
) {
  return options.find((item) => item.key === key)?.label ?? "확인 필요";
}

function ActionFollowupCard({
  record,
  participantId,
  onUpdated,
}: {
  record: ActionLogRecord;
  participantId: string;
  onUpdated: (records: ActionLogRecord[], summary: ActionLogSummary) => void;
}) {
  const [actualRain, setActualRain] = useState<ActualRainKey | null>(null);
  const [nextMoisture, setNextMoisture] = useState<MoistureKey | null>(null);
  const [actionTaken, setActionTaken] = useState<ActionTakenKey | null>(null);
  const [helpfulness, setHelpfulness] = useState<HelpfulnessKey | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [notice, setNotice] = useState("");

  const cropLabel = optionLabel(CROP_OPTIONS, record.crop);
  const stageLabel = optionLabel(STAGE_OPTIONS, record.stage);
  const initialMoistureLabel = optionLabel(MOISTURE_OPTIONS, record.initialMoisture);

  async function submitFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actualRain || !nextMoisture || !actionTaken || !helpfulness) {
      setStatus("error");
      setNotice("실제 결과 네 가지를 모두 선택해주세요.");
      return;
    }

    setStatus("saving");
    setNotice("실제 결과를 저장하고 있습니다.");
    try {
      const response = await fetch("/api/action-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "followup",
          participantId,
          id: record.id,
          actualRain,
          nextMoisture,
          actionTaken,
          helpfulness,
        }),
      });
      const payload = (await response.json()) as {
        saved?: boolean;
        records?: ActionLogRecord[];
        summary?: ActionLogSummary;
        error?: string;
      };
      if (!response.ok || !payload.saved || !payload.records || !payload.summary) {
        throw new Error(payload.error ?? "실제 결과를 저장하지 못했습니다.");
      }
      onUpdated(payload.records, payload.summary);
    } catch (followupError) {
      setStatus("error");
      setNotice(
        followupError instanceof Error
          ? followupError.message
          : "실제 결과를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }
  }

  if (record.status === "completed") {
    return (
      <article className="journal-record is-completed">
        <div className="journal-record-heading">
          <div>
            <span>{fullDate(record.observationDate)} · {record.reservoirName}</span>
            <h4>{record.actionTitle}</h4>
          </div>
          <strong><span aria-hidden="true">✓</span> 결과 확인 완료</strong>
        </div>
        <div className="journal-record-context">
          <span>{cropLabel}</span><span>{stageLabel}</span><span>처음 수분 {initialMoistureLabel}</span>
        </div>
        <div className="journal-result-grid" aria-label="기록한 실제 결과">
          <div><span>실제 비</span><strong>{optionLabel(ACTUAL_RAIN_OPTIONS, record.actualRain)}</strong></div>
          <div><span>다음 포장 수분</span><strong>{optionLabel(MOISTURE_OPTIONS, record.nextMoisture)}</strong></div>
          <div><span>실제 행동</span><strong>{optionLabel(ACTION_TAKEN_OPTIONS, record.actionTaken)}</strong></div>
          <div><span>도움 정도</span><strong>{optionLabel(HELPFULNESS_OPTIONS, record.helpfulness)}</strong></div>
        </div>
        <p className="journal-completed-note">
          {formatReportDate(record.completedAt)} 기록 · 이 결과는 같은 조건에서 행동카드를 개선할 근거로 집계됩니다.
        </p>
      </article>
    );
  }

  const formReady = Boolean(actualRain && nextMoisture && actionTaken && helpfulness);

  return (
    <article className="journal-record is-pending">
      <div className="journal-record-heading">
        <div>
          <span>{fullDate(record.observationDate)} · {record.reservoirName}</span>
          <h4>{record.actionTitle}</h4>
        </div>
        <strong><span aria-hidden="true">○</span> 결과 확인 대기</strong>
      </div>
      <div className="journal-record-context">
        <span>{cropLabel}</span><span>{stageLabel}</span><span>처음 수분 {initialMoistureLabel}</span>
        <span>예보 {rainfallText(record.threeDayRain)}</span>
      </div>

      <form className="journal-followup-form" onSubmit={submitFollowup}>
        <div className="journal-followup-intro">
          <strong>다음날 또는 실제 포장을 다시 본 뒤 기록하세요</strong>
          <p>정답을 맞히는 시험이 아닙니다. 안내와 달랐던 결과도 개선에 꼭 필요한 자료입니다.</p>
        </div>

        <fieldset>
          <legend><span>1</span>실제로 비가 얼마나 왔나요?</legend>
          <div className="journal-option-grid is-four">
            {ACTUAL_RAIN_OPTIONS.map((item) => (
              <button
                type="button"
                key={item.key}
                className={actualRain === item.key ? "is-selected" : ""}
                aria-pressed={actualRain === item.key}
                onClick={() => { setActualRain(item.key); setStatus("idle"); setNotice(""); }}
              >{item.label}</button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend><span>2</span>다시 본 포장 수분은 어땠나요?</legend>
          <div className="journal-option-grid is-three">
            {MOISTURE_OPTIONS.map((item) => (
              <button
                type="button"
                key={item.key}
                className={nextMoisture === item.key ? "is-selected" : ""}
                aria-pressed={nextMoisture === item.key}
                onClick={() => { setNextMoisture(item.key); setStatus("idle"); setNotice(""); }}
              >{item.label}</button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend><span>3</span>행동카드를 실제로 어떻게 활용했나요?</legend>
          <div className="journal-action-options">
            {ACTION_TAKEN_OPTIONS.map((item) => (
              <button
                type="button"
                key={item.key}
                className={actionTaken === item.key ? "is-selected" : ""}
                aria-pressed={actionTaken === item.key}
                onClick={() => { setActionTaken(item.key); setStatus("idle"); setNotice(""); }}
              ><strong>{item.label}</strong><small>{item.note}</small></button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend><span>4</span>결정하는 데 얼마나 도움이 됐나요?</legend>
          <div className="journal-option-grid is-three">
            {HELPFULNESS_OPTIONS.map((item) => (
              <button
                type="button"
                key={item.key}
                className={helpfulness === item.key ? "is-selected" : ""}
                aria-pressed={helpfulness === item.key}
                onClick={() => { setHelpfulness(item.key); setStatus("idle"); setNotice(""); }}
              >{item.label}</button>
            ))}
          </div>
        </fieldset>

        <div className="journal-followup-submit">
          <p>이름·전화번호·정확한 농장 위치는 저장하지 않습니다.</p>
          <button type="submit" disabled={!formReady || status === "saving"}>
            {status === "saving" ? "결과 저장 중" : "실제 결과 기록하기"}
          </button>
        </div>
        {notice ? <div className={`journal-notice is-${status}`} role="status">{notice}</div> : null}
      </form>
    </article>
  );
}

function ActionJournal({
  data,
  profile,
  action,
}: {
  data: ReservoirData;
  profile: FarmProfile;
  action: FarmAction;
}) {
  const [participantId, setParticipantId] = useState("");
  const [records, setRecords] = useState<ActionLogRecord[]>([]);
  const [summary, setSummary] = useState<ActionLogSummary>(EMPTY_ACTION_LOG_SUMMARY);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "success" | "error">("loading");
  const [notice, setNotice] = useState("");
  const [returnLinkNotice, setReturnLinkNotice] = useState("");

  const observationKey = [
    data.current.date,
    data.reservoir.key,
    profile.crop,
    profile.stage,
    profile.moisture,
    action.title,
  ].join("|");

  useEffect(() => {
    const id = getAnonymousParticipantId();
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setParticipantId(id);
      try {
        const response = await fetch(`/api/action-log?participantId=${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          records?: ActionLogRecord[];
          summary?: ActionLogSummary;
          error?: string;
        };
        if (!response.ok || !payload.records || !payload.summary) {
          throw new Error(payload.error ?? "행동카드 기록을 불러오지 못했습니다.");
        }
        setRecords(payload.records);
        setSummary(payload.summary);
        setStatus("idle");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setStatus("error");
        setNotice(
          loadError instanceof Error
            ? loadError.message
            : "행동카드 기록을 불러오지 못했습니다.",
        );
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const currentRecord = records.find((record) =>
    record.observationDate === data.current.date &&
    record.reservoirKey === data.reservoir.key &&
    record.crop === profile.crop &&
    record.stage === profile.stage &&
    record.initialMoisture === profile.moisture &&
    record.actionTitle === action.title,
  );

  const pendingRecords = records.filter((record) => record.status === "pending");
  const completedRecords = records.filter((record) => record.status === "completed");
  const participationState = status === "loading"
    ? {
        tone: "loading",
        step: "확인 중",
        title: "이 기기의 참여 기록을 불러오고 있어요",
        description: "잠시 후 오늘 해야 할 단계가 표시됩니다.",
        href: "#today-action-save",
        action: "잠시만 기다려주세요",
      }
    : pendingRecords.length > 0
      ? {
          tone: "followup",
          step: "다음 확인",
          title: "저장한 행동카드의 실제 결과를 입력해주세요",
          description: `${pendingRecords.length}건이 결과 확인을 기다리고 있습니다. 실제 포장을 다시 본 뒤 네 항목을 선택하면 참여가 완료됩니다.`,
          href: "#my-action-records",
          action: "결과 입력하러 가기",
        }
      : completedRecords.length > 0
        ? {
            tone: "complete",
            step: "참여 완료",
            title: "행동과 결과가 연결된 근거가 쌓였어요",
            description: `${completedRecords.length}건의 검증을 완료했습니다. 다른 날의 판단도 같은 방식으로 추가할 수 있습니다.`,
            href: "#today-action-save",
            action: "새로운 오늘 기록하기",
          }
        : {
            tone: "start",
            step: "오늘 1일차",
            title: "먼저 오늘의 행동카드를 저장해주세요",
            description: "저장 후 실제 포장을 다시 확인할 때 같은 휴대폰으로 돌아오면 됩니다.",
            href: "#today-action-save",
            action: "오늘 카드 저장하러 가기",
          };

  async function keepReturnLink() {
    const returnUrl = `${window.location.origin}${window.location.pathname}#outcome-loop`;
    const shareData = {
      title: "물살핌 2일 현장검증",
      text: "같은 휴대폰으로 다시 열어 실제 비와 다음 포장 상태를 기록해주세요.",
      url: returnUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setReturnLinkNotice("링크를 보냈습니다. 다음 확인 때 같은 휴대폰에서 다시 열어주세요.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(returnUrl);
        setReturnLinkNotice("링크를 복사했습니다. 이 휴대폰의 메모나 '나에게 보내기'에 붙여넣어 보관해주세요.");
      } else {
        throw new Error("share-unavailable");
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setReturnLinkNotice("주소창의 링크를 이 휴대폰 메모나 '나에게 보내기'에 저장해주세요.");
    }
  }

  async function saveCurrentAction() {
    if (!participantId || currentRecord) return;
    const threeDay = data.forecast.horizons.find((item) => item.horizon === 3);
    setStatus("saving");
    setNotice("오늘의 행동카드를 저장하고 있습니다.");
    try {
      const response = await fetch("/api/action-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "save",
          participantId,
          observationKey,
          reservoirKey: data.reservoir.key,
          reservoirName: data.reservoir.name,
          observationDate: data.current.date,
          actionTitle: action.title,
          actionTone: action.tone,
          crop: profile.crop,
          stage: profile.stage,
          initialMoisture: profile.moisture,
          dataSource: data.source,
          currentRate: data.current.rate,
          waterStatus: data.status.label,
          threeDayRain: data.forecast.weather.threeDayRain,
          forecastDecision: threeDay?.decision ?? "hold",
          forecastAdoption: threeDay?.adoption ?? "hold",
        }),
      });
      const payload = (await response.json()) as {
        saved?: boolean;
        records?: ActionLogRecord[];
        summary?: ActionLogSummary;
        error?: string;
      };
      if (!response.ok || !payload.saved || !payload.records || !payload.summary) {
        throw new Error(payload.error ?? "오늘의 행동카드를 저장하지 못했습니다.");
      }
      setRecords(payload.records);
      setSummary(payload.summary);
      setStatus("success");
      setNotice("저장했습니다. 실제 포장을 다시 확인한 뒤 아래 기록에서 결과를 남겨주세요.");
    } catch (saveError) {
      setStatus("error");
      setNotice(
        saveError instanceof Error
          ? saveError.message
          : "오늘의 행동카드를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }
  }

  function applyUpdate(nextRecords: ActionLogRecord[], nextSummary: ActionLogSummary) {
    setRecords(nextRecords);
    setSummary(nextSummary);
    setStatus("success");
    setNotice("실제 결과를 기록했습니다. 행동과 결과가 연결된 개선 근거가 한 건 쌓였습니다.");
  }

  return (
    <section className="action-journal" id="outcome-loop" aria-labelledby="action-journal-title">
      <div className="journal-intro">
        <div>
          <span className="section-kicker">물살핌 v0.11 · 2일 익명 현장검증</span>
          <h3 id="action-journal-title">오늘 1분, 다음 확인 때 1분이면 참여 완료</h3>
          <p>오늘 행동카드를 저장하고 실제 포장을 다시 확인할 때 결과를 남겨주세요. 이름·전화번호·정확한 농장 위치는 받지 않습니다.</p>
        </div>
        <div className="journal-cycle" aria-label="2일 현장검증 3단계">
          <div><span>오늘</span><strong>행동카드 저장</strong></div>
          <i aria-hidden="true">→</i>
          <div><span>다음</span><strong>결과 4개 입력</strong></div>
          <i aria-hidden="true">→</i>
          <div><span>완료</span><strong>검증 근거 1건</strong></div>
        </div>
      </div>

      <div className="pilot-readiness">
        <article className={`pilot-progress-card is-${participationState.tone}`} aria-live="polite">
          <span className="pilot-card-label">이 기기의 참여 상태</span>
          <div className="pilot-progress-title">
            <b>{participationState.step}</b>
            <strong>{participationState.title}</strong>
          </div>
          <p>{participationState.description}</p>
          <a
            className={participationState.tone === "loading" ? "is-disabled" : ""}
            href={participationState.href}
            aria-disabled={participationState.tone === "loading"}
          >
            {participationState.action}<span aria-hidden="true">→</span>
          </a>
        </article>

        <aside className="pilot-device-card" aria-label="참여 전 꼭 확인할 사항">
          <span className="pilot-card-label">참여 전 꼭 확인</span>
          <h4>같은 휴대폰·같은 브라우저로 다시 오세요</h4>
          <ul>
            <li>시크릿 모드는 사용하지 않기</li>
            <li>참여가 끝날 때까지 인터넷 기록을 지우지 않기</li>
            <li>여러 사람은 각자의 휴대폰으로 참여하기</li>
          </ul>
          <button type="button" onClick={keepReturnLink}>다시 올 링크 저장하기</button>
          {returnLinkNotice ? <p className="pilot-link-notice" role="status">{returnLinkNotice}</p> : null}
        </aside>
      </div>

      <div className="journal-overview">
        <article className="journal-save-card" id="today-action-save">
          <div className="journal-save-heading">
            <div><span>오늘 저장할 카드</span><strong>{data.reservoir.name} · {fullDate(data.current.date)}</strong></div>
            <span className={currentRecord ? "is-saved" : ""}>{currentRecord ? "저장됨" : "저장 전"}</span>
          </div>
          <h4>{action.title}</h4>
          <div className="journal-save-facts">
            <span>{optionLabel(CROP_OPTIONS, profile.crop)}</span>
            <span>{optionLabel(STAGE_OPTIONS, profile.stage)}</span>
            <span>수분 {optionLabel(MOISTURE_OPTIONS, profile.moisture)}</span>
            <span>3일 비 {rainfallText(data.forecast.weather.threeDayRain)}</span>
          </div>
          <button
            className="journal-save-button"
            type="button"
            disabled={!participantId || Boolean(currentRecord) || status === "saving"}
            onClick={saveCurrentAction}
          >
            {status === "saving" ? "저장 중" : currentRecord ? "오늘 카드 저장 완료" : "오늘 행동카드 저장"}
          </button>
          {notice ? <div className={`journal-notice is-${status}`} role="status" aria-live="polite">{notice}</div> : null}
        </article>

        <aside className="journal-evidence" aria-label="누적 행동 결과 검증">
          <div className="journal-evidence-heading"><span>누적 익명 사후검증</span><strong>{summary.total}건</strong></div>
          <div className="journal-metrics">
            <div><strong>{summary.participants}<small>명</small></strong><span>기록 참여</span></div>
            <div><strong>{summary.completed}<small>건</small></strong><span>결과 확인</span></div>
            <div><strong>{summary.helpfulRate}<small>%</small></strong><span>도움됨</span></div>
          </div>
          <p><strong>{summary.pending}건은 결과 확인 대기 중입니다.</strong> 만족도만 묻지 않고, 실제 행동과 다음 포장 상태를 연결해 봅니다.</p>
        </aside>
      </div>

      <div className="journal-records" id="my-action-records">
        <div className="journal-records-heading">
          <div><span>이 기기의 익명 기록</span><h4>내 행동카드 기록</h4></div>
          <p>최근 12건만 표시합니다</p>
        </div>
        {status === "loading" ? (
          <div className="journal-empty"><strong>기록을 불러오고 있어요</strong><p>잠시만 기다려주세요.</p></div>
        ) : records.length ? (
          <div className="journal-record-list">
            {records.map((record) => (
              <ActionFollowupCard
                key={`${record.id}-${record.status}-${record.completedAt ?? "pending"}`}
                record={record}
                participantId={participantId}
                onUpdated={applyUpdate}
              />
            ))}
          </div>
        ) : (
          <div className="journal-empty"><strong>아직 저장한 행동카드가 없습니다</strong><p>위 버튼으로 오늘 카드를 저장하면 이곳에서 실제 결과를 이어서 기록할 수 있습니다.</p></div>
        )}
      </div>

      <div className="journal-guardrail">
        <span aria-hidden="true">i</span>
        <p><strong>자동 재학습이라고 과장하지 않습니다.</strong> 쌓인 구조화 기록은 조건별 규칙을 비교하고 다음 모델·행동카드 개선 후보를 정하는 근거로 사용합니다.</p>
      </div>
    </section>
  );
}

function FieldFeedback({
  data,
  profile,
  action,
}: {
  data: ReservoirData;
  profile: FarmProfile;
  action: FarmAction;
}) {
  const [verdict, setVerdict] = useState<FeedbackVerdict | null>(null);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [clarity, setClarity] = useState<FeedbackClarity | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<FeedbackSummary>(EMPTY_FEEDBACK_SUMMARY);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/feedback", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { summary?: FeedbackSummary };
        if (payload.summary) setSummary(payload.summary);
      } catch {
        // 집계 연결이 잠시 늦어져도 현재 행동카드는 그대로 사용할 수 있습니다.
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  function chooseVerdict(nextVerdict: FeedbackVerdict) {
    setVerdict(nextVerdict);
    if (nextVerdict === "match") setReason(null);
    setStatus("idle");
    setNotice("");
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verdict || !clarity || (verdict === "different" && !reason)) {
      setStatus("error");
      setNotice("현장 일치 여부와 이해도를 모두 선택해주세요.");
      return;
    }

    const threeDay = data.forecast.horizons.find((item) => item.horizon === 3);
    const observationKey = [
      data.current.date,
      data.reservoir.key,
      profile.crop,
      profile.stage,
      profile.moisture,
      action.title,
    ].join("|");

    setStatus("saving");
    setNotice("현장 기록을 안전하게 저장하고 있습니다.");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: getAnonymousParticipantId(),
          observationKey,
          verdict,
          reason: verdict === "different" ? reason : null,
          clarity,
          reservoirKey: data.reservoir.key,
          reservoirName: data.reservoir.name,
          observationDate: data.current.date,
          actionTitle: action.title,
          actionTone: action.tone,
          crop: profile.crop,
          stage: profile.stage,
          moisture: profile.moisture,
          dataSource: data.source,
          currentRate: data.current.rate,
          waterStatus: data.status.label,
          threeDayRain: data.forecast.weather.threeDayRain,
          forecastDecision: threeDay?.decision ?? "hold",
          forecastAdoption: threeDay?.adoption ?? "hold",
        }),
      });
      const payload = (await response.json()) as {
        saved?: boolean;
        frozen?: boolean;
        summary?: FeedbackSummary;
        error?: string;
      };
      if (!response.ok || !payload.saved) {
        throw new Error(payload.error ?? "현장 기록을 저장하지 못했습니다.");
      }
      if (payload.summary) setSummary(payload.summary);
      setStatus("success");
      setNotice(
        payload.frozen
          ? "첫 3명의 고정판 기록이라 기존 응답을 그대로 보호했습니다. 다른 조건의 새 기록은 2차 검증에 누적됩니다."
          : "기록했습니다. 같은 조건으로 다시 보내면 기존 기록만 고쳐집니다.",
      );
    } catch (feedbackError) {
      setStatus("error");
      setNotice(
        feedbackError instanceof Error
          ? feedbackError.message
          : "현장 기록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }
  }

  const targetProgress = Math.min(100, (summary.participants / 3) * 100);
  const targetMet = summary.participants >= 3;
  const formReady = Boolean(
    verdict && clarity && (verdict === "match" || reason),
  );

  return (
    <section className="field-feedback" aria-labelledby="field-feedback-title">
      <div className="feedback-intro">
        <div>
          <span className="section-kicker">물살핌 v0.8 · 농업인 검증·개선 루프</span>
          <h3 id="field-feedback-title">이 안내가 실제 현장과 맞았는지 알려주세요</h3>
          <p>한 번의 탭이 다음 행동카드를 더 정확하고 더 쉬운 말로 바꾸는 검증자료가 됩니다.</p>
        </div>

        <div className={`feedback-goal ${targetMet ? "is-complete" : ""}`} aria-label={`농업인 3명 중 ${Math.min(summary.participants, 3)}명 참여`}>
          <div className="feedback-goal-heading">
            <div><span>1차 사용성 테스트</span><strong>{targetMet ? "표본 고정 완료" : "농업인 3명"}</strong></div>
            <strong>{Math.min(summary.participants, 3)}<small>/3명</small></strong>
          </div>
          <div className="feedback-progress"><span style={{ width: `${targetProgress}%` }} /></div>
          <p>{targetMet ? "후속 응답은 2차 검증으로 누적되며 첫 3명의 고정판은 바뀌지 않습니다." : "서로 다른 농업인의 휴대폰에서 조건을 직접 선택하고 1회씩 기록해보세요."}</p>
        </div>
      </div>

      <div className="feedback-layout">
        <div className="feedback-impact" aria-label="누적 현장검증 결과">
          <div className="feedback-impact-heading"><span>실시간 누적 현장검증</span><strong>{summary.total}건</strong></div>
          <div className="feedback-metrics">
            <div><strong>{summary.participants}<small>명</small></strong><span>익명 참여</span></div>
            <div><strong>{summary.matchRate}<small>%</small></strong><span>현장과 일치</span></div>
            <div><strong>{summary.easyRate}<small>%</small></strong><span>바로 이해됨</span></div>
          </div>
          <div className="feedback-evidence-note">
            <span aria-hidden="true">✓</span>
            <p><strong>고정판과 누적값을 함께 봅니다.</strong> 첫 3명은 증거로 보존하고 이후 응답은 개선 판단에 사용합니다.</p>
          </div>
        </div>

        <form className="feedback-form" onSubmit={submitFeedback}>
          <fieldset>
            <legend><span>1</span>오늘의 행동카드가 현장 상황과 맞았나요?</legend>
            <div className="verdict-buttons">
              <button
                type="button"
                className={verdict === "match" ? "is-selected is-match" : ""}
                aria-pressed={verdict === "match"}
                onClick={() => chooseVerdict("match")}
              >
                <span aria-hidden="true">✓</span>
                <div><strong>현장과 맞아요</strong><small>점검 순서가 적절해요</small></div>
              </button>
              <button
                type="button"
                className={verdict === "different" ? "is-selected is-different" : ""}
                aria-pressed={verdict === "different"}
                onClick={() => chooseVerdict("different")}
              >
                <span aria-hidden="true">≠</span>
                <div><strong>현장과 달라요</strong><small>다른 판단이 필요해요</small></div>
              </button>
            </div>
          </fieldset>

          {verdict === "different" ? (
            <fieldset className="reason-fieldset">
              <legend><span>2</span>무엇이 가장 달랐나요?</legend>
              <div className="reason-buttons">
                {FEEDBACK_REASONS.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={reason === item.key ? "is-selected" : ""}
                    aria-pressed={reason === item.key}
                    onClick={() => {
                      setReason(item.key);
                      setStatus("idle");
                      setNotice("");
                    }}
                  >{item.label}</button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset>
            <legend><span>{verdict === "different" ? "3" : "2"}</span>안내 문장은 이해하기 쉬웠나요?</legend>
            <div className="clarity-buttons">
              {FEEDBACK_CLARITY.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={clarity === item.key ? "is-selected" : ""}
                  aria-pressed={clarity === item.key}
                  onClick={() => {
                    setClarity(item.key);
                    setStatus("idle");
                    setNotice("");
                  }}
                >
                  <strong>{item.label}</strong><small>{item.note}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="feedback-submit-row">
            <div className="feedback-privacy">
              <span aria-hidden="true">i</span>
              <p>이름·전화번호·정확한 농장 위치는 받지 않습니다. 이 기기의 익명 참여번호만 사용합니다.</p>
            </div>
            <button className="feedback-submit" type="submit" disabled={!formReady || status === "saving"}>
              {status === "saving" ? "저장 중" : status === "success" ? "기록 수정하기" : "현장 기록 남기기"}
            </button>
          </div>

          {notice ? (
            <div className={`feedback-notice is-${status}`} role="status" aria-live="polite">
              <span aria-hidden="true">{status === "success" ? "✓" : status === "error" ? "!" : "…"}</span>
              <p>{notice}</p>
            </div>
          ) : null}
        </form>
      </div>

      <ValidationReport summary={summary} />
    </section>
  );
}

function FarmActionCard({ data }: { data: ReservoirData }) {
  const [profile, setProfile] = useState<FarmProfile>(DEFAULT_FARM_PROFILE);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(FARM_PROFILE_STORAGE_KEY);
        if (!stored) return;
        const parsed: unknown = JSON.parse(stored);
        if (isFarmProfile(parsed)) setProfile(parsed);
      } catch {
        // 저장값을 읽지 못해도 기본 선택으로 계속 사용할 수 있습니다.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function updateProfile<Key extends keyof FarmProfile>(
    key: Key,
    value: FarmProfile[Key],
  ) {
    const next = { ...profile, [key]: value };
    setProfile(next);
    try {
      window.localStorage.setItem(FARM_PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 브라우저 저장이 막혀 있어도 현재 화면의 맞춤 안내는 정상 작동합니다.
    }
  }

  const action = useMemo(() => buildFarmAction(data, profile), [data, profile]);
  const cropLabel = CROP_OPTIONS.find((item) => item.key === profile.crop)?.label ?? "작물";
  const stageLabel = STAGE_OPTIONS.find((item) => item.key === profile.stage)?.label ?? "생육단계";
  const moistureLabel = MOISTURE_OPTIONS.find((item) => item.key === profile.moisture)?.label ?? "확인 필요";

  return (
    <section className="farm-section" id="daily-decision" aria-labelledby="farm-action-title">
      <div className="farm-intro">
        <div>
          <span className="section-kicker">물살핌 v0.10 · 농업인 하루판단판</span>
          <h2 id="farm-action-title">영농 조건 3가지를 더해, 오늘 확인할 순서를 정합니다</h2>
          <p>KRC 농업용수 현황과 3일 비 전망에 내 작물·생육단계·포장 수분을 더합니다. 정답처럼 물 양을 지시하지 않고 현장에서 먼저 살필 순서를 안내합니다.</p>
        </div>
        <div className="device-save-note">
          <span aria-hidden="true">✓</span>
          <div><strong>내 영농 조건 자동 기억</strong><p>작물·생육단계·수분 선택은 이 기기에만 저장됩니다.</p></div>
        </div>
      </div>

      <div className="farm-workspace">
        <div className="farm-profile-panel" aria-label="농가 조건 선택">
          <div className="profile-heading">
            <span>하루판단 2단계</span>
            <strong>내 조건 3가지</strong>
          </div>

          <label htmlFor="farm-crop">재배 작물</label>
          <div className="farm-select-wrap">
            <select
              id="farm-crop"
              value={profile.crop}
              onChange={(event) => updateProfile("crop", event.target.value as CropKey)}
            >
              {CROP_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </div>

          <label htmlFor="farm-stage">지금 생육단계</label>
          <div className="farm-select-wrap">
            <select
              id="farm-stage"
              value={profile.stage}
              onChange={(event) => updateProfile("stage", event.target.value as StageKey)}
            >
              {STAGE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </div>

          <label htmlFor="farm-moisture">오늘 포장 수분</label>
          <div className="farm-select-wrap">
            <select
              id="farm-moisture"
              value={profile.moisture}
              onChange={(event) => updateProfile("moisture", event.target.value as MoistureKey)}
            >
              {MOISTURE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </div>

          <div className="profile-tip">
            <LeafMark />
            <p><strong>수분은 눈으로만 보지 마세요.</strong> 가능하면 뿌리 주변 흙을 손으로 확인한 뒤 선택하세요.</p>
          </div>
        </div>

        <article className={`farm-plan tone-${action.tone}`} aria-live="polite">
          <div className="farm-plan-top">
            <span className="farm-plan-kicker">{action.eyebrow}</span>
            <span className="confidence-pill">{action.confidence}</span>
          </div>
          <div className="farm-plan-title">
            <span aria-hidden="true">{action.tone === "rain" ? "☂" : action.tone === "pause" ? "!" : "✓"}</span>
            <div><small>오늘의 우선 행동</small><h3>{action.title}</h3></div>
          </div>
          <p className="farm-plan-lead">{action.lead}</p>

          <ol className="action-steps">
            {action.steps.map((step, index) => (
              <li key={`${index}-${step}`}><span>{index + 1}</span><p>{step}</p></li>
            ))}
          </ol>

          <div className="decision-evidence" aria-label="판단에 사용한 정보">
            <span>{data.reservoir.name} {data.current.rate.toFixed(1)}% · {data.status.label}</span>
            <span>3일 비 {rainfallText(data.forecast.weather.threeDayRain)}</span>
            <span>{cropLabel} · {stageLabel}</span>
            <span>포장 수분 {moistureLabel}</span>
            <span>{action.forecastLabel}</span>
          </div>

          <div className="confidence-note"><strong>{action.confidence}</strong><p>{action.confidenceNote}</p></div>
          <div className="farm-safety-note">
            <span aria-hidden="true">i</span>
            <p>정확한 물 양은 제시하지 않습니다. 실제 결정은 작물·품종·토양과 관할 KRC 지사 및 지역 농업기술센터 안내를 함께 확인하세요.</p>
          </div>
        </article>
      </div>

      <ActionJournal
        key={[
          "journal",
          data.current.date,
          data.reservoir.key,
          profile.crop,
          profile.stage,
          profile.moisture,
          action.title,
        ].join("-")}
        data={data}
        profile={profile}
        action={action}
      />

      <FieldFeedback
        key={[
          data.current.date,
          data.reservoir.key,
          profile.crop,
          profile.stage,
          profile.moisture,
          action.title,
        ].join("-")}
        data={data}
        profile={profile}
        action={action}
      />

      <div className="farm-basis">
        <strong>판단 원칙</strong>
        <p>농촌진흥청의 생육단계별 관개·배수 원칙을 참고해, 처방보다 “오늘 확인할 순서”에 집중했습니다.</p>
        <a href="https://www.nongsaro.go.kr/portal/ps/psv/psvr/psvre/curationDtl.ps?menuId=PS03352&srchCurationNo=2263" target="_blank" rel="noreferrer">농촌진흥청 근거 보기 ↗</a>
      </div>
    </section>
  );
}

function rainfallText(value: number | null) {
  return value === null ? "확인 중" : `${value.toFixed(1)}mm`;
}

function ForecastLab({
  forecast,
  currentRate,
}: {
  forecast: ReservoirData["forecast"];
  currentRate: number;
}) {
  const passedCount = forecast.horizons.filter((item) => item.decision === "pass").length;
  const weatherAdoptedCount = forecast.horizons.filter(
    (item) => item.adoption === "weather",
  ).length;
  const statusTitle = weatherAdoptedCount
    ? `날씨 결합 ${weatherAdoptedCount}개 채택`
    : passedCount
      ? "기존 검증모형 유지"
      : "예측값 공개 보류";

  return (
    <section className="forecast-section" id="forecast-evidence" aria-labelledby="forecast-title">
      <div className="forecast-intro">
        <div>
          <span className="section-kicker">물살핌 v0.4 · 날씨 결합 실험실</span>
          <h2 id="forecast-title">비 예보를 넣었을 때, 정말 더 정확해졌는지 봅니다</h2>
          <p>
            과거의 각 날짜에 실제로 발표됐던 강수예보만 사용해 v0.3과 다시 겨뤘습니다.
          </p>
        </div>
        <div className={`lab-status ${passedCount ? "has-pass" : "is-hold"}`}>
          <span>현재 v0.4 판정</span>
          <strong>{statusTitle}</strong>
          <p>{weatherAdoptedCount ? "날씨가 실제 오차를 더 줄인 기간만 새 모형으로 바꿉니다." : passedCount ? "날씨가 더 낫지 않으면 검증된 v0.3 결과를 그대로 지킵니다." : "기준을 넘기 전까지 후보값은 관수 판단에 쓰지 않습니다."}</p>
        </div>
      </div>

      <div className={`weather-bridge ${forecast.weather.connected ? "is-connected" : "is-unavailable"}`}>
        <div className="weather-bridge-copy">
          <span className="weather-icon" aria-hidden="true">☂</span>
          <div>
            <small>저수지 주변 강수 전망</small>
            <strong>{forecast.weather.summary}</strong>
            <p>{forecast.weather.action}</p>
          </div>
        </div>
        <div className="rain-total-grid">
          <div><span>내일까지</span><strong>{rainfallText(forecast.weather.oneDayRain)}</strong></div>
          <div><span>3일 누적</span><strong>{rainfallText(forecast.weather.threeDayRain)}</strong></div>
          <div><span>과거예보 채움률</span><strong>{forecast.weather.historyCoverageRate.toFixed(1)}%</strong></div>
        </div>
        {forecast.weather.outlook.length ? (
          <div className="weather-day-list" aria-label="앞으로 3일 강수 전망">
            {forecast.weather.outlook.map((day) => (
              <div key={day.date}>
                <span>{shortDate(day.date)}</span>
                <strong>{day.rainfall.toFixed(1)}mm</strong>
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="weather-unavailable-note">강수예보 연결을 재시도하고 있습니다. 기존 수위 진단은 정상적으로 볼 수 있습니다.</p>
        )}
      </div>

      <div className="forecast-card-grid">
        {forecast.horizons.map((item) => {
          const maxMae = Math.max(
            item.backtest.baselineMae,
            item.backtest.waterMae,
            item.backtest.modelMae ?? 0,
            0.01,
          );
          const baselineWidth = Math.max(4, (item.backtest.baselineMae / maxMae) * 100);
          const waterWidth = Math.max(4, (item.backtest.waterMae / maxMae) * 100);
          const modelWidth = item.backtest.modelMae === null
            ? 0
            : Math.max(4, (item.backtest.modelMae / maxMae) * 100);
          const selectedImprovement = item.adoption === "weather"
            ? item.backtest.improvementPct
            : item.backtest.waterImprovementPct;
          const improved = (selectedImprovement ?? 0) >= 0;
          const weatherGain = item.backtest.weatherGainPct;
          return (
            <article className={`forecast-card decision-${item.decision} adoption-${item.adoption}`} key={item.horizon}>
              <div className="forecast-card-heading">
                <div>
                  <span>{item.horizon === 1 ? "내일" : "3일 뒤"}</span>
                  <strong>{item.horizon}일 예측</strong>
                  <small>{fullDate(item.forecastDate)}</small>
                </div>
                <span className="decision-pill">{item.decisionLabel}</span>
              </div>

              <div className="forecast-value-row">
                <div>
                  <span>{item.decision === "pass" ? item.adoption === "weather" ? "날씨 반영 공개값" : "기존 검증 공개값" : "후보 실험값"}</span>
                  <div className="forecast-value">
                    <strong>{item.predictedRate.toFixed(1)}</strong><small>%</small>
                  </div>
                </div>
                <div className="forecast-change">
                  <span>오늘 {currentRate.toFixed(1)}%</span>
                  <strong className={item.change > 0 ? "is-up" : item.change < 0 ? "is-down" : ""}>
                    {signed(item.change)}
                  </strong>
                </div>
              </div>

              <div className="rain-context">
                <span>{item.horizon}일 동안 예상 강수</span>
                <strong>{rainfallText(item.rainfallForecast)}</strong>
              </div>

              <div className="interval-note">
                <span>과거 절대오차 {item.interval.coverage}% 기준 범위</span>
                <strong>{item.interval.lower.toFixed(1)}% — {item.interval.upper.toFixed(1)}%</strong>
              </div>

              <div className="mae-panel">
                <div className="mae-heading">
                  <span>같은 검증구간 평균절대오차(MAE)</span>
                  <strong className={improved ? "is-better" : "is-worse"}>
                    {weatherGain === null
                      ? "날씨 연결 대기"
                      : `v0.3 대비 ${weatherGain >= 0 ? "개선" : "악화"} ${Math.abs(weatherGain).toFixed(1)}%`}
                  </strong>
                </div>
                <div className="mae-row">
                  <span>기준모형</span>
                  <div><i style={{ width: `${baselineWidth}%` }} /></div>
                  <strong>{item.backtest.baselineMae.toFixed(3)}</strong>
                </div>
                <div className="mae-row water-row">
                  <span>v0.3 수위</span>
                  <div><i style={{ width: `${waterWidth}%` }} /></div>
                  <strong>{item.backtest.waterMae.toFixed(3)}</strong>
                </div>
                <div className="mae-row model-row">
                  <span>v0.4 날씨</span>
                  <div><i style={{ width: `${modelWidth}%` }} /></div>
                  <strong>{item.backtest.modelMae === null ? "—" : item.backtest.modelMae.toFixed(3)}</strong>
                </div>
              </div>

              <div className="forecast-meta">
                <span><b>공개 모형</b> {item.model.label}</span>
                <span><b>날씨 후보</b> {item.weatherModel.label}</span>
                <span><b>모형 선택</b> {item.backtest.selectionTests}회</span>
                <span><b>검증 횟수</b> {item.backtest.tests}회</span>
              </div>
              <p className="forecast-reason">{item.reason}</p>
              {item.decision === "hold" && (
                <p className="hold-warning">후보 실험값은 관수 판단에 사용하지 않습니다.</p>
              )}
            </article>
          );
        })}
      </div>

      <div className="guardrail-grid">
        <article>
          <span>01</span>
          <div><strong>단순 기준부터</strong><p>{forecast.baseline}</p></div>
        </article>
        <article>
          <span>02</span>
          <div><strong>과거 예보만</strong><p>{forecast.leakageGuard}</p></div>
        </article>
        <article>
          <span>03</span>
          <div><strong>두 번 이겨야 교체</strong><p>{forecast.releaseRule}</p></div>
        </article>
      </div>

      <div className="forecast-disclaimer">
        <span aria-hidden="true">!</span>
        <p><strong>강수예보까지 반영했지만 아직 실험 단계입니다.</strong> 방류량·급수 일정·작물과 토양 상태는 포함하지 않았으므로 실제 농업용수 결정의 단독 근거로 사용하지 않습니다.</p>
      </div>
    </section>
  );
}

export default function Home() {
  const [selected, setSelected] = useState("tapjeong");
  const [data, setData] = useState<ReservoirData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("탑정저수지의 최신 기록을 확인하고 있습니다.");

  const loadReservoir = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    const option = RESERVOIR_OPTIONS.find((item) => item.key === key);
    setMessage(`${option?.name ?? "선택한 저수지"}의 365일 기록과 과거 강수예보를 맞추고 있습니다.`);
    try {
      const response = await fetch(`/api/reservoir?reservoir=${encodeURIComponent(key)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as ReservoirData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "수위정보를 불러오지 못했습니다.");
      setData(payload);
      const passedCount = payload.forecast.horizons.filter((item) => item.decision === "pass").length;
      const weatherAdopted = payload.forecast.horizons.filter(
        (item) => item.adoption === "weather",
      ).length;
      setMessage(
        payload.source === "krc"
          ? `KRC 실데이터 ${payload.diagnostics.summary.uniqueDays}일 · 공개 ${passedCount}/2 · 날씨 결합 ${weatherAdopted}/2 채택`
          : "연결 전 연습용 데이터로 진단판의 전체 흐름을 보여드리고 있습니다.",
      );
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "수위정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReservoir("tapjeong");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReservoir]);

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadReservoir(selected);
    window.requestAnimationFrame(() => {
      document.getElementById("daily-decision")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  const isLive = data?.source === "krc";
  const summary = data?.diagnostics.summary;
  const verdict = data?.diagnostics.verdict;

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="물살핌 홈">
          <span className="brand-mark"><WaterMark /></span>
          <span className="brand-name">물살핌</span>
          <span className="brand-tagline">농업인 하루판단판</span>
        </a>
        <div className="header-actions">
          <nav className="site-nav" aria-label="주요 화면 바로가기">
            <a href="#daily-decision">하루판단</a>
            <a href="#outcome-loop">2일 현장검증</a>
            <a href="#evidence-lab">AI 근거</a>
          </nav>
          <div className={`connection-pill ${isLive ? "is-live" : ""}`}>
            <span className="connection-dot" aria-hidden="true" />
            {isLive ? "KRC 실데이터 연결" : "연결 확인 중"}
          </div>
        </div>
      </header>

      <div className="page-content" id="top">
        <section className="hero-grid" aria-labelledby="hero-title">
          <div className="hero-copy-panel">
            <div className="eyebrow"><span className="eyebrow-dot" /> 2일 익명 현장검증 진행 중 · KRC 데이터로 준비하는 농업인의 하루</div>
            <h1 id="hero-title">오늘 농업용수 현황부터,<br /><span>내 농사 판단까지</span></h1>
            <p className="hero-copy">
              전국 대표 저수지 5곳의 365일 기록과 3일 비 전망을 검증하고,<br className="desktop-break" />
              내 작물·생육단계·포장 수분을 더해 오늘 먼저 확인할 순서를 알려드립니다.
            </p>

            <div className="decision-equation" aria-label="하루판단에 사용하는 정보">
              <div className="decision-inputs">
                <span><b>01</b>KRC 농업용수 현황</span>
                <span><b>02</b>3일 비 전망</span>
                <span><b>03</b>내 작물·포장</span>
              </div>
              <div className="decision-output"><span aria-hidden="true">→</span><strong>오늘 확인할 순서</strong></div>
            </div>

            <form className="lookup-form" onSubmit={handleLookup}>
              <label htmlFor="reservoir">1단계 · 먼저 확인할 대표 저수지</label>
              <div className="lookup-controls">
                <div className="select-wrap">
                  <span className="select-icon" aria-hidden="true">≈</span>
                  <select
                    id="reservoir"
                    value={selected}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    {RESERVOIR_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.name} · {option.location}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={loading}>
                  <WaterMark className="button-icon" />
                  {loading ? "판단 준비 중" : "하루판단 시작"}
                </button>
              </div>
            </form>

            <div className={`mode-note ${isLive ? "is-live" : ""}`} role="status" aria-live="polite">
              <span aria-hidden="true">{isLive ? "✓" : "i"}</span>
              <p>{message}</p>
            </div>
            {error && (
              <div className="error-note" role="alert">
                <span aria-hidden="true">!</span>
                <p>{error}</p>
              </div>
            )}
          </div>

          {data ? (
            <div className={`today-panel ${loading ? "is-loading" : ""}`}>
              <div className="today-heading">
                <div>
                  <span className="today-step-label">하루판단 근거 1 · KRC 농업용수 현황</span>
                  <span className="region-chip">{data.reservoir.region}</span>
                  <h2>{data.reservoir.name}</h2>
                  <p>{data.reservoir.county}</p>
                </div>
                <div className={`status-badge tone-${data.status.tone}`}>
                  <span aria-hidden="true">●</span> {data.status.label}
                </div>
              </div>

              <div className="today-summary">
                <article className="rate-card">
                  <p>오늘 저수율</p>
                  <div className="rate-value"><strong>{data.current.rate.toFixed(1)}</strong><span>%</span></div>
                  <div className="level-row">
                    <span aria-hidden="true">≈</span>
                    수위 <strong>{data.current.waterLevel.toFixed(2)}m</strong>
                  </div>
                  <small>{fullDate(data.current.date)} 기준</small>
                </article>

                <article className="action-card">
                  <div className="action-title"><LeafMark /><span>농업용수 현황에서 읽은 신호</span></div>
                  <p>{data.status.action}</p>
                  <div className="trend-pill">
                    <span>{data.trend.label}</span>
                    <strong>{signed(data.trend.delta)}</strong>
                  </div>
                </article>
              </div>

              <div className="trend-section">
                <div className="section-mini-heading">
                  <div>
                    <span>최근 7일 흐름</span>
                    <strong>{data.series[0].rate.toFixed(1)}% → {data.current.rate.toFixed(1)}%</strong>
                  </div>
                  <small>저수율</small>
                </div>
                <TrendChart series={data.series} />
              </div>
              <a className="today-to-decision" href="#daily-decision">
                <span><small>다음 2단계</small><strong>내 작물·생육·포장 상태를 더해 오늘 행동 보기</strong></span>
                <i aria-hidden="true">→</i>
              </a>
            </div>
          ) : <LoadingPanel />}
        </section>

        {data ? <FarmActionCard data={data} /> : null}

        {data ? (
          <section className="evidence-hub" id="evidence-lab" aria-labelledby="evidence-title">
            <div>
              <span className="section-kicker">판단 근거 공개 · 데이터와 AI 안전장치</span>
              <h2 id="evidence-title">왜 이런 안내가 나왔는지, 아래에서 검증할 수 있습니다</h2>
              <p>하루판단판은 감으로 답하지 않습니다. 원자료 건강검진, 기준모형 비교, 과거시점 백테스트를 통과한 정보만 행동카드의 근거로 사용합니다.</p>
            </div>
            <div className="evidence-flow" aria-label="판단 근거 검증 순서">
              <span><b>1</b>365일 원자료</span><i>→</i><span><b>2</b>1·3일 백테스트</span><i>→</i><span><b>3</b>통과값만 공개</span>
            </div>
          </section>
        ) : null}

        {data && summary && verdict ? (
          <section className={`diagnostic-section ${loading ? "is-loading" : ""}`} id="data-evidence" aria-labelledby="diagnostic-title">
            <div className="diagnostic-intro">
              <div>
                <span className="section-kicker">물살핌 v0.2 · 데이터 건강검진</span>
                <h2 id="diagnostic-title">AI 학습 전에, 365일 기록부터 확인했습니다</h2>
                <p>
                  예측 결과를 꾸미기 전에 원자료가 얼마나 빠짐없이 이어지는지 먼저 보는 단계입니다.
                </p>
              </div>
              <div className={`verdict-card verdict-${verdict.level}`}>
                <span>현재 판정</span>
                <strong>{verdict.title}</strong>
                <p>{verdict.note}</p>
              </div>
            </div>

            <div className="diagnostic-grid">
              <article className="coverage-card">
                <div className="coverage-heading">
                  <div>
                    <span>데이터 채움률</span>
                    <strong>{summary.coverageRate.toFixed(1)}<small>%</small></strong>
                  </div>
                  <span className={summary.coverageRate >= 90 ? "quality-good" : "quality-watch"}>
                    {summary.coverageRate >= 90 ? "충분" : "점검 필요"}
                  </span>
                </div>
                <div className="coverage-track" aria-label={`365일 중 ${summary.uniqueDays}일 기록`}>
                  <span style={{ width: `${Math.min(100, summary.coverageRate)}%` }} />
                </div>
                <p><strong>{summary.uniqueDays}일</strong> 기록됨 · {summary.missingDays}일 비어 있음</p>
              </article>

              <div className="metric-grid">
                <article className="metric-card">
                  <span>최근 갱신</span>
                  <strong>{summary.lagDays === 0 ? "오늘" : `${summary.lagDays}일 전`}</strong>
                  <small>{fullDate(summary.latestDate)}</small>
                </article>
                <article className="metric-card">
                  <span>결측</span>
                  <strong>{summary.missingDays}<small>일</small></strong>
                  <small>전체의 {summary.missingRate.toFixed(1)}%</small>
                </article>
                <article className="metric-card">
                  <span>급변 의심</span>
                  <strong>{summary.abruptChanges}<small>회</small></strong>
                  <small>하루 ±{summary.abruptThreshold}%p 이상</small>
                </article>
                <article className="metric-card">
                  <span>같은 값 연속</span>
                  <strong>{summary.longestFlatRun}<small>일</small></strong>
                  <small>센서 정체 확인 지표</small>
                </article>
              </div>
            </div>

            <div className="history-card">
              <div className="history-heading">
                <div>
                  <span>365일 저수율 흐름</span>
                  <strong>{fullDate(data.diagnostics.requestedFrom)} — {fullDate(data.diagnostics.requestedTo)}</strong>
                </div>
                <p>계절 변화와 긴 공백을 한눈에 확인합니다.</p>
              </div>
              <HistoryChart series={data.history} />
            </div>

            <div className="monthly-card">
              <div className="monthly-heading">
                <div>
                  <span>월별 기록 채움률</span>
                  <strong>최근 12개월</strong>
                </div>
                <p>막대가 낮은 달은 학습 전에 원자료를 다시 확인하세요.</p>
              </div>
              <div className="month-bars">
                {data.diagnostics.months.map((month) => (
                  <div className="month-item" key={month.key}>
                    <span className="month-value">{Math.round(month.coverage)}%</span>
                    <div className="month-track" title={`${month.key} · ${month.actual}/${month.expected}일`}>
                      <span style={{ height: `${Math.max(4, month.coverage)}%` }} />
                    </div>
                    <span className="month-label">{month.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="diagnostic-notes">
              <div className="plain-note">
                <span aria-hidden="true">i</span>
                <p><strong>이 결과는 예측 성능 점수가 아닙니다.</strong> AI 예측에 넣기 전 원자료의 연속성·최신성·이상 변화를 보는 건강검진입니다.</p>
              </div>
              <details>
                <summary>물살핌 내부 판정 기준 보기</summary>
                <ul>
                  <li>365일 중 300일 이상, 결측 10% 이하, 최근 3일 이내 갱신이면 예측 실험 준비 가능</li>
                  <li>180일 이상, 결측 30% 이하, 최근 7일 이내 갱신이면 1·3일 단기예측부터 권장</li>
                  <li>급변 의심은 하루 저수율 변화가 ±15%p 이상인 경우를 세는 참고 지표</li>
                </ul>
              </details>
            </div>
          </section>
        ) : null}

        {data ? (
          <ForecastLab forecast={data.forecast} currentRate={data.current.rate} />
        ) : null}

        <section className="selection-reason" aria-labelledby="selection-title">
          <div>
            <span className="section-kicker">대표군 선정 원칙</span>
            <h2 id="selection-title">권역과 기후가 다른 5곳을 골랐습니다</h2>
          </div>
          <div className="reservoir-chip-list">
            {RESERVOIR_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.key}
                className={data?.reservoir.key === option.key ? "is-active" : ""}
                onClick={() => {
                  setSelected(option.key);
                  void loadReservoir(option.key);
                }}
                disabled={loading}
              >
                <span>{option.region}</span>
                <strong>{option.name}</strong>
                <small>{option.location}</small>
              </button>
            ))}
          </div>
        </section>
      </div>

      <footer className="site-footer">
        <p><strong>데이터 출처</strong> 한국농어촌공사 수위정보 · Open-Meteo 제공 JMA 강수예보 · OpenStreetMap 위치 기준</p>
        <p>실제 관수·급수 결정 전에는 관할 지사 안내와 현장 상황을 함께 확인하세요.</p>
      </footer>
    </main>
  );
}
