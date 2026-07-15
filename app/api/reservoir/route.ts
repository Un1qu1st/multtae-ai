type Reading = {
  date: string;
  waterLevel: number;
  rate: number;
};

type RawReading = {
  date: string;
  waterLevel: number;
  rate: number;
};

type WeatherHistoryDay = {
  date: string;
  lead1: number | null;
  lead2: number | null;
  lead3: number | null;
};

type WeatherOutlookDay = {
  date: string;
  rainfall: number;
  weatherCode: number;
  label: string;
};

type WeatherBundle = {
  status: "connected" | "unavailable";
  source: string;
  model: string;
  latitude: number;
  longitude: number;
  history: Map<string, WeatherHistoryDay>;
  historyCoverageRate: number;
  outlook: WeatherOutlookDay[];
  note: string;
};

const RESERVOIRS = {
  idong: {
    name: "이동저수지",
    lookupName: "이동",
    lookupCounty: "경기도",
    county: "경기도 용인시",
    region: "수도권",
    reason: "수도권 남부 농업용수를 대표하는 KRC 주요저수지",
    code: "4149010037",
    latitude: 37.120856,
    longitude: 127.201519,
  },
  tapjeong: {
    name: "탑정저수지",
    lookupName: "탑정",
    lookupCounty: "충청남도",
    county: "충청남도 논산시",
    region: "충청",
    reason: "논산평야의 농업용수를 공급하는 충청권 주요저수지",
    code: "4423010045",
    latitude: 36.178377,
    longitude: 127.17984,
  },
  naju: {
    name: "나주호",
    lookupName: "나주호",
    lookupCounty: "전라남도",
    county: "전라남도 나주시",
    region: "호남",
    reason: "넓은 농경지를 둔 전남 내륙의 대형 농업용 저수지",
    code: "4617010200",
    latitude: 34.941493,
    longitude: 126.857385,
  },
  seongju: {
    name: "성주저수지",
    lookupName: "성주",
    lookupCounty: "경상북도",
    county: "경상북도 성주군",
    region: "영남 내륙",
    reason: "밭작물·시설재배가 활발한 경북 내륙의 주요저수지",
    code: "4784010100",
    latitude: 35.91712,
    longitude: 128.137098,
  },
  hadong: {
    name: "하동저수지",
    lookupName: "하동",
    lookupCounty: "경상남도",
    county: "경상남도 하동군",
    region: "남해안",
    reason: "남해안 기후권의 농업용수를 보여주는 KRC 주요저수지",
    code: "4885010137",
    latitude: 35.174165,
    longitude: 127.780283,
  },
} as const;

type ReservoirKey = keyof typeof RESERVOIRS;
type ReservoirConfig = (typeof RESERVOIRS)[ReservoirKey];

const API_ROOT = "https://apis.data.go.kr/B552149/reserviorWaterLevel";
const WEATHER_HISTORY_ROOT = "https://previous-runs-api.open-meteo.com/v1/forecast";
const WEATHER_FORECAST_ROOT = "https://api.open-meteo.com/v1/forecast";
const REQUESTED_DAYS = 365;

function yyyymmdd(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return yyyymmdd(date);
}

function isoDate(value: string) {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function addDaysKey(value: string, days: number) {
  const date = parseDate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return yyyymmdd(date);
}

function parseDate(value: string) {
  if (!/^\d{8}$/.test(value)) return null;
  const date = new Date(
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayDifference(earlier: string, later: string) {
  const from = parseDate(earlier);
  const to = parseDate(later);
  if (!from || !to) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function sampleSeries(): Reading[] {
  return Array.from({ length: REQUESTED_DAYS }, (_, index) => {
    const seasonal = Math.sin((index / REQUESTED_DAYS) * Math.PI * 2) * 12;
    const pulse = Math.sin(index / 14) * 2.4;
    const rate = Number((62 + seasonal + pulse).toFixed(1));
    return {
      date: dateDaysAgo(REQUESTED_DAYS - index - 1),
      waterLevel: Number((24.7 + rate * 0.011).toFixed(2)),
      rate,
    };
  });
}

function statusFor(rate: number) {
  if (rate >= 70) {
    return {
      label: "여유",
      tone: "safe" as const,
      action: "저수율이 안정적입니다. 계획한 관수 일정을 유지해도 좋습니다.",
    };
  }
  if (rate >= 50) {
    return {
      label: "보통",
      tone: "normal" as const,
      action: "평상시 관수 계획을 유지하되, 다음 갱신 때 흐름을 다시 확인하세요.",
    };
  }
  if (rate >= 30) {
    return {
      label: "주의",
      tone: "caution" as const,
      action: "관수 순서와 사용량을 점검하고 물 절약 계획을 미리 준비하세요.",
    };
  }
  return {
    label: "위험",
    tone: "danger" as const,
    action: "용수 공급 계획을 즉시 확인하고 대체 수원 가능 여부를 살펴보세요.",
  };
}

function trendFor(series: Reading[]) {
  const recent = series.slice(-7);
  const delta = Number((recent.at(-1)!.rate - recent[0].rate).toFixed(1));
  if (delta >= 2) return { label: "최근 7일 상승", delta };
  if (delta <= -2) return { label: "최근 7일 하락", delta };
  return { label: "최근 7일 비슷", delta };
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim();
}

function tagValue(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function itemBlocks(xml: string) {
  return Array.from(xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)).map(
    (match) => match[1],
  );
}

function parseReadings(xml: string): RawReading[] {
  return itemBlocks(xml).map((block) => ({
    date: tagValue(block, "check_date"),
    waterLevel: Number(tagValue(block, "water_level")),
    rate: Number(tagValue(block, "rate")),
  }));
}

function getApiKey() {
  const raw = process.env.KRC_API_KEY ?? "";
  const key = raw.trim();
  if (!key.includes("%")) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

async function requestKrc(path: "reservoirlevel", params: URLSearchParams) {
  const endpoint = new URL(`${API_ROOT}/${path}/`);
  endpoint.search = params.toString();
  const response = await fetch(endpoint, {
    headers: { Accept: "application/xml, text/xml;q=0.9" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`KRC API 응답 오류 (${response.status})`);
  }
  const xml = await response.text();
  const code = tagValue(xml, "returnReasonCode");
  const authMessage = tagValue(xml, "returnAuthMsg");
  if (code && code !== "00") {
    throw new Error(`KRC API 요청 오류 (${code} ${authMessage})`);
  }
  return xml;
}

type PreviousRunsResponse = {
  hourly?: {
    time?: string[];
    precipitation_previous_day1?: Array<number | null>;
    precipitation_previous_day2?: Array<number | null>;
    precipitation_previous_day3?: Array<number | null>;
  };
  reason?: string;
};

type ForecastResponse = {
  daily?: {
    time?: string[];
    precipitation_sum?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
  reason?: string;
};

function weatherLabel(code: number) {
  if ([0, 1].includes(code)) return "대체로 맑음";
  if ([2, 3].includes(code)) return "구름 많음";
  if ([45, 48].includes(code)) return "안개";
  if (code >= 51 && code <= 57) return "이슬비";
  if (code >= 61 && code <= 67) return "비";
  if (code >= 71 && code <= 77) return "눈";
  if (code >= 80 && code <= 82) return "소나기";
  if (code >= 95) return "천둥·번개";
  return "날씨 변화";
}

async function requestWeatherJson<T>(endpoint: URL) {
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`날씨 API 응답 오류 (${response.status})`);
  }
  const payload = (await response.json()) as T & { error?: boolean; reason?: string };
  if (payload.error) throw new Error(payload.reason || "날씨 API 요청 오류");
  return payload;
}

function buildWeatherHistory(payload: PreviousRunsResponse) {
  const hourly = payload.hourly;
  const times = hourly?.time ?? [];
  const leadArrays = [
    hourly?.precipitation_previous_day1 ?? [],
    hourly?.precipitation_previous_day2 ?? [],
    hourly?.precipitation_previous_day3 ?? [],
  ];
  const sums = new Map<string, { sums: number[]; counts: number[] }>();

  times.forEach((time, index) => {
    const date = time.slice(0, 10).replaceAll("-", "");
    if (!/^\d{8}$/.test(date)) return;
    const bucket = sums.get(date) ?? { sums: [0, 0, 0], counts: [0, 0, 0] };
    leadArrays.forEach((values, leadIndex) => {
      const value = values[index];
      if (typeof value === "number" && Number.isFinite(value)) {
        bucket.sums[leadIndex] += value;
        bucket.counts[leadIndex] += 1;
      }
    });
    sums.set(date, bucket);
  });

  const history = new Map<string, WeatherHistoryDay>();
  sums.forEach((bucket, date) => {
    const valueFor = (index: number) =>
      bucket.counts[index] >= 18 ? Number(bucket.sums[index].toFixed(2)) : null;
    history.set(date, {
      date,
      lead1: valueFor(0),
      lead2: valueFor(1),
      lead3: valueFor(2),
    });
  });
  return history;
}

function buildWeatherOutlook(payload: ForecastResponse) {
  const daily = payload.daily;
  const times = daily?.time ?? [];
  return times.map((time, index) => {
    const rainfall = daily?.precipitation_sum?.[index];
    const weatherCode = daily?.weather_code?.[index];
    const safeCode = typeof weatherCode === "number" ? weatherCode : -1;
    return {
      date: time.replaceAll("-", ""),
      rainfall: typeof rainfall === "number" && Number.isFinite(rainfall)
        ? Number(rainfall.toFixed(1))
        : 0,
      weatherCode: safeCode,
      label: weatherLabel(safeCode),
    };
  });
}

function weatherHistoryCoverage(history: Map<string, WeatherHistoryDay>) {
  if (!history.size) return 0;
  const complete = Array.from(history.values()).filter(
    (day) => day.lead1 !== null && day.lead2 !== null && day.lead3 !== null,
  ).length;
  return Number(((complete / history.size) * 100).toFixed(1));
}

async function requestWeather(
  config: ReservoirConfig,
  requestedFrom: string,
  requestedTo: string,
): Promise<WeatherBundle> {
  const historyEndpoint = new URL(WEATHER_HISTORY_ROOT);
  historyEndpoint.search = new URLSearchParams({
    latitude: String(config.latitude),
    longitude: String(config.longitude),
    hourly: "precipitation_previous_day1,precipitation_previous_day2,precipitation_previous_day3",
    models: "jma_seamless",
    start_date: isoDate(requestedFrom),
    end_date: isoDate(requestedTo),
    timezone: "Asia/Seoul",
  }).toString();

  const forecastEndpoint = new URL(WEATHER_FORECAST_ROOT);
  forecastEndpoint.search = new URLSearchParams({
    latitude: String(config.latitude),
    longitude: String(config.longitude),
    daily: "precipitation_sum,weather_code",
    models: "jma_seamless",
    forecast_days: "4",
    timezone: "Asia/Seoul",
  }).toString();

  const [historyPayload, forecastPayload] = await Promise.all([
    requestWeatherJson<PreviousRunsResponse>(historyEndpoint),
    requestWeatherJson<ForecastResponse>(forecastEndpoint),
  ]);
  const history = buildWeatherHistory(historyPayload);
  const outlook = buildWeatherOutlook(forecastPayload);
  if (!history.size || outlook.length < 2) {
    throw new Error("검증에 필요한 강수예보 기록이 충분하지 않습니다.");
  }

  return {
    status: "connected",
    source: "Open-Meteo 제공 JMA 예보",
    model: "JMA MSM·GSM seamless",
    latitude: config.latitude,
    longitude: config.longitude,
    history,
    historyCoverageRate: weatherHistoryCoverage(history),
    outlook,
    note: "과거에는 당시 발표된 1·2·3일 전 예보만 사용했습니다.",
  };
}

function unavailableWeather(config: ReservoirConfig, message: string): WeatherBundle {
  return {
    status: "unavailable",
    source: "Open-Meteo 제공 JMA 예보",
    model: "JMA MSM·GSM seamless",
    latitude: config.latitude,
    longitude: config.longitude,
    history: new Map(),
    historyCoverageRate: 0,
    outlook: [],
    note: message,
  };
}

function resolveFacility(config: ReservoirConfig) {
  return { code: config.code, name: config.lookupName, county: config.county };
}

function monthKeys() {
  const now = new Date();
  now.setUTCDate(1);
  now.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now);
    date.setUTCMonth(date.getUTCMonth() - (11 - index));
    return yyyymmdd(date).slice(0, 6);
  });
}

function diagnosticsFor(raw: RawReading[], requestedFrom: string, requestedTo: string) {
  const invalidValues = raw.filter(
    (item) =>
      !/^\d{8}$/.test(item.date) ||
      !Number.isFinite(item.waterLevel) ||
      !Number.isFinite(item.rate),
  ).length;
  const valid = raw
    .filter(
      (item): item is Reading =>
        /^\d{8}$/.test(item.date) &&
        Number.isFinite(item.waterLevel) &&
        Number.isFinite(item.rate),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const byDate = new Map<string, Reading>();
  valid.forEach((item) => byDate.set(item.date, item));
  const series = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const duplicateDays = Math.max(0, valid.length - series.length);
  const uniqueDays = series.length;
  const missingDays = Math.max(0, REQUESTED_DAYS - uniqueDays);
  const coverageRate = Number(((uniqueDays / REQUESTED_DAYS) * 100).toFixed(1));
  const missingRate = Number(((missingDays / REQUESTED_DAYS) * 100).toFixed(1));
  const latestDate = series.at(-1)?.date ?? "";
  const lagDays = latestDate ? dayDifference(latestDate, requestedTo) : REQUESTED_DAYS;

  let abruptChanges = 0;
  let longestFlatRun = series.length ? 1 : 0;
  let flatRun = series.length ? 1 : 0;
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    const consecutive = dayDifference(previous.date, current.date) === 1;
    if (consecutive && Math.abs(current.rate - previous.rate) >= 15) abruptChanges += 1;
    if (consecutive && current.rate === previous.rate) {
      flatRun += 1;
      longestFlatRun = Math.max(longestFlatRun, flatRun);
    } else {
      flatRun = 1;
    }
  }

  const actualDates = new Set(series.map((item) => item.date));
  const months = monthKeys().map((key) => {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4, 6));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let expected = 0;
    let actual = 0;
    for (let day = 1; day <= lastDay; day += 1) {
      const date = `${key}${String(day).padStart(2, "0")}`;
      if (date < requestedFrom || date > requestedTo) continue;
      expected += 1;
      if (actualDates.has(date)) actual += 1;
    }
    return {
      key,
      label: `${month}월`,
      actual,
      expected,
      coverage: expected ? Number(((actual / expected) * 100).toFixed(1)) : 0,
    };
  });

  let verdict = {
    level: "diagnostic" as "ready" | "short" | "diagnostic",
    title: "예측보다 상태 진단부터",
    note: "먼저 결측과 갱신 지연을 줄인 뒤 예측 모델을 붙이는 편이 안전합니다.",
  };
  if (uniqueDays >= 300 && missingRate <= 10 && lagDays <= 3) {
    verdict = {
      level: "ready",
      title: "AI 예측 실험 준비 가능",
      note: "365일 흐름이 충분히 이어져 기준모형과 1·3일 예측을 비교해볼 수 있습니다.",
    };
  } else if (uniqueDays >= 180 && missingRate <= 30 && lagDays <= 7) {
    verdict = {
      level: "short",
      title: "1·3일 단기예측부터",
      note: "장기 전망보다 짧은 예측을 먼저 검증하고, 성능이 확인되면 기간을 늘리세요.",
    };
  }

  return {
    series,
    summary: {
      requestedDays: REQUESTED_DAYS,
      uniqueDays,
      coverageRate,
      missingDays,
      missingRate,
      duplicateDays,
      invalidValues,
      latestDate,
      lagDays,
      abruptChanges,
      abruptThreshold: 15,
      longestFlatRun,
    },
    months,
    verdict,
    requestedFrom,
    requestedTo,
  };
}

type ForecastMethod = "trend" | "pattern" | "ensemble";
type WeatherForecastMethod = "weatherPattern" | "weatherEnsemble";

function clampRate(value: number) {
  return Math.min(100, Math.max(0, value));
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function isConsecutive(series: Reading[], start: number, end: number) {
  if (start < 0 || end >= series.length || start > end) return false;
  for (let index = start + 1; index <= end; index += 1) {
    if (dayDifference(series[index - 1].date, series[index].date) !== 1) return false;
  }
  return true;
}

function trendPrediction(history: Reading[], horizon: number) {
  const windowSize = Math.min(14, history.length);
  const window = history.slice(-windowSize);
  if (window.length < 7 || !isConsecutive(window, 0, window.length - 1)) return null;
  const center = (window.length - 1) / 2;
  const averageRate = mean(window.map((item) => item.rate));
  let numerator = 0;
  let denominator = 0;
  window.forEach((item, index) => {
    const x = index - center;
    numerator += x * (item.rate - averageRate);
    denominator += x * x;
  });
  const rawSlope = denominator ? numerator / denominator : 0;
  const slope = Math.min(3, Math.max(-3, rawSlope));
  const damping = horizon === 1 ? 0.82 : 0.68;
  return clampRate(history.at(-1)!.rate + slope * horizon * damping);
}

function patternPrediction(history: Reading[], horizon: number) {
  const patternLength = 8;
  const lastIndex = history.length - 1;
  const currentStart = lastIndex - patternLength + 1;
  if (
    currentStart < patternLength + horizon ||
    !isConsecutive(history, currentStart, lastIndex)
  ) {
    return null;
  }

  const currentDeltas = Array.from({ length: patternLength - 1 }, (_, index) =>
    history[currentStart + index + 1].rate - history[currentStart + index].rate,
  );
  const currentRate = history[lastIndex].rate;
  const candidates: Array<{ distance: number; futureDelta: number }> = [];

  for (let end = patternLength - 1; end + horizon < currentStart; end += 1) {
    const start = end - patternLength + 1;
    if (!isConsecutive(history, start, end + horizon)) continue;
    let distance = 0;
    for (let index = 0; index < patternLength - 1; index += 1) {
      const candidateDelta = history[start + index + 1].rate - history[start + index].rate;
      const difference = currentDeltas[index] - candidateDelta;
      distance += difference * difference;
    }
    const levelDifference = (currentRate - history[end].rate) / 12;
    distance = Math.sqrt(distance / (patternLength - 1) + levelDifference * levelDifference * 0.12);
    candidates.push({
      distance,
      futureDelta: history[end + horizon].rate - history[end].rate,
    });
  }

  if (candidates.length < 20) return null;
  const neighbors = candidates.sort((a, b) => a.distance - b.distance).slice(0, 12);
  let weightedDelta = 0;
  let totalWeight = 0;
  neighbors.forEach((neighbor) => {
    const weight = 1 / Math.max(0.08, neighbor.distance);
    weightedDelta += neighbor.futureDelta * weight;
    totalWeight += weight;
  });
  return clampRate(currentRate + weightedDelta / totalWeight);
}

function candidatePredictions(history: Reading[], horizon: number) {
  const trend = trendPrediction(history, horizon);
  const pattern = patternPrediction(history, horizon);
  const ensemble =
    trend !== null && pattern !== null
      ? clampRate(pattern * 0.62 + trend * 0.38)
      : null;
  return { trend, pattern, ensemble };
}

function historicalRainForOrigin(
  weather: WeatherBundle,
  originDate: string,
  horizon: number,
) {
  let total = 0;
  for (let offset = 1; offset <= horizon; offset += 1) {
    const targetDate = addDaysKey(originDate, offset);
    const day = weather.history.get(targetDate);
    const value = offset === 1 ? day?.lead1 : offset === 2 ? day?.lead2 : day?.lead3;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    total += value;
  }
  return Number(total.toFixed(2));
}

function currentRainForOrigin(
  weather: WeatherBundle,
  originDate: string,
  horizon: number,
) {
  let total = 0;
  for (let offset = 1; offset <= horizon; offset += 1) {
    const targetDate = addDaysKey(originDate, offset);
    const day = weather.outlook.find((item) => item.date === targetDate);
    if (!day) return null;
    total += day.rainfall;
  }
  return Number(total.toFixed(1));
}

function weatherPatternPrediction(
  history: Reading[],
  horizon: number,
  weather: WeatherBundle,
  currentRainOverride?: number | null,
) {
  const patternLength = 8;
  const lastIndex = history.length - 1;
  const currentStart = lastIndex - patternLength + 1;
  if (
    currentStart < patternLength + horizon ||
    !isConsecutive(history, currentStart, lastIndex)
  ) {
    return null;
  }

  const currentRain = currentRainOverride === undefined
    ? historicalRainForOrigin(weather, history[lastIndex].date, horizon)
    : currentRainOverride;
  if (currentRain === null) return null;

  const currentDeltas = Array.from({ length: patternLength - 1 }, (_, index) =>
    history[currentStart + index + 1].rate - history[currentStart + index].rate,
  );
  const currentRate = history[lastIndex].rate;
  const candidates: Array<{ distance: number; futureDelta: number }> = [];

  for (let end = patternLength - 1; end + horizon < currentStart; end += 1) {
    const start = end - patternLength + 1;
    if (!isConsecutive(history, start, end + horizon)) continue;
    const candidateRain = historicalRainForOrigin(weather, history[end].date, horizon);
    if (candidateRain === null) continue;

    let deltaDistance = 0;
    for (let index = 0; index < patternLength - 1; index += 1) {
      const candidateDelta = history[start + index + 1].rate - history[start + index].rate;
      const difference = currentDeltas[index] - candidateDelta;
      deltaDistance += difference * difference;
    }
    const levelDifference = (currentRate - history[end].rate) / 12;
    const rainDifference = Math.log1p(currentRain) - Math.log1p(candidateRain);
    const distance = Math.sqrt(
      deltaDistance / (patternLength - 1) +
      levelDifference * levelDifference * 0.12 +
      rainDifference * rainDifference * 0.9,
    );
    candidates.push({
      distance,
      futureDelta: history[end + horizon].rate - history[end].rate,
    });
  }

  if (candidates.length < 20) return null;
  const neighbors = candidates.sort((a, b) => a.distance - b.distance).slice(0, 12);
  let weightedDelta = 0;
  let totalWeight = 0;
  neighbors.forEach((neighbor) => {
    const weight = 1 / Math.max(0.08, neighbor.distance);
    weightedDelta += neighbor.futureDelta * weight;
    totalWeight += weight;
  });
  return clampRate(currentRate + weightedDelta / totalWeight);
}

function weatherCandidatePredictions(
  history: Reading[],
  horizon: number,
  weather: WeatherBundle,
  currentRainOverride?: number | null,
) {
  const weatherPattern = weatherPatternPrediction(
    history,
    horizon,
    weather,
    currentRainOverride,
  );
  const trend = trendPrediction(history, horizon);
  const weatherEnsemble = weatherPattern !== null && trend !== null
    ? clampRate(weatherPattern * 0.7 + trend * 0.3)
    : null;
  return { weatherPattern, weatherEnsemble };
}

function methodLabel(method: ForecastMethod) {
  if (method === "pattern") return "유사패턴 ML";
  if (method === "ensemble") return "유사패턴·추세 혼합";
  return "최근 추세";
}

function weatherMethodLabel(method: WeatherForecastMethod) {
  if (method === "weatherEnsemble") return "강수예보·추세 혼합";
  return "강수예보 유사패턴 ML";
}

function horizonForecast(
  series: Reading[],
  horizon: 1 | 3,
  qualityReady: boolean,
  weather: WeatherBundle,
) {
  const waterRecords: Array<{
    date: string;
    errors: Record<"baseline" | ForecastMethod, number>;
  }> = [];
  const weatherRecords: Array<{
    date: string;
    baseline: number;
    water: Record<ForecastMethod, number>;
    weather: Record<WeatherForecastMethod, number>;
  }> = [];
  const recentTestLimit = 190;
  const firstOrigin = Math.max(80, series.length - recentTestLimit - horizon);

  for (let origin = firstOrigin; origin + horizon < series.length; origin += 1) {
    if (dayDifference(series[origin].date, series[origin + horizon].date) !== horizon) continue;
    const history = series.slice(0, origin + 1);
    const predictions = candidatePredictions(history, horizon);
    if (
      predictions.trend === null ||
      predictions.pattern === null ||
      predictions.ensemble === null
    ) {
      continue;
    }
    const actual = series[origin + horizon].rate;
    const baselineError = Math.abs(actual - series[origin].rate);
    const waterErrors: Record<ForecastMethod, number> = {
      trend: Math.abs(actual - predictions.trend),
      pattern: Math.abs(actual - predictions.pattern),
      ensemble: Math.abs(actual - predictions.ensemble),
    };
    waterRecords.push({
      date: series[origin + horizon].date,
      errors: {
        baseline: baselineError,
        ...waterErrors,
      },
    });

    const weatherPredictions = weatherCandidatePredictions(history, horizon, weather);
    if (
      weatherPredictions.weatherPattern === null ||
      weatherPredictions.weatherEnsemble === null
    ) {
      continue;
    }
    weatherRecords.push({
      date: series[origin + horizon].date,
      baseline: baselineError,
      water: waterErrors,
      weather: {
        weatherPattern: Math.abs(actual - weatherPredictions.weatherPattern),
        weatherEnsemble: Math.abs(actual - weatherPredictions.weatherEnsemble),
      },
    });
  }

  const waterMethods: ForecastMethod[] = ["trend", "pattern", "ensemble"];
  const desiredWaterSelection = Math.max(40, Math.floor(waterRecords.length * 0.35));
  const waterSelectionCount = Math.min(
    desiredWaterSelection,
    Math.max(0, waterRecords.length - 80),
  );
  const waterSelectionRecords = waterRecords.slice(0, waterSelectionCount);
  const waterValidationRecords = waterRecords.slice(waterSelectionCount);
  const bestWaterMethod = waterMethods.reduce((best, method) =>
    mean(waterSelectionRecords.map((record) => record.errors[method])) <
    mean(waterSelectionRecords.map((record) => record.errors[best]))
      ? method
      : best,
  );
  const waterBaselineErrors = waterValidationRecords.map((record) => record.errors.baseline);
  const waterModelErrors = waterValidationRecords.map(
    (record) => record.errors[bestWaterMethod],
  );
  const waterBaselineMae = mean(waterBaselineErrors);
  const waterMae = mean(waterModelErrors);
  const waterImprovementPct = waterBaselineMae > 0
    ? ((waterBaselineMae - waterMae) / waterBaselineMae) * 100
    : 0;

  const weatherMethods: WeatherForecastMethod[] = ["weatherPattern", "weatherEnsemble"];
  const desiredWeatherSelection = Math.max(40, Math.floor(weatherRecords.length * 0.35));
  const weatherSelectionCount = Math.min(
    desiredWeatherSelection,
    Math.max(0, weatherRecords.length - 80),
  );
  const weatherSelectionRecords = weatherRecords.slice(0, weatherSelectionCount);
  const weatherValidationRecords = weatherRecords.slice(weatherSelectionCount);
  const bestWeatherMethod = weatherMethods.reduce((best, method) =>
    mean(weatherSelectionRecords.map((record) => record.weather[method])) <
    mean(weatherSelectionRecords.map((record) => record.weather[best]))
      ? method
      : best,
  );
  const weatherBaselineErrors = weatherValidationRecords.map((record) => record.baseline);
  const matchedWaterErrors = weatherValidationRecords.map(
    (record) => record.water[bestWaterMethod],
  );
  const weatherModelErrors = weatherValidationRecords.map(
    (record) => record.weather[bestWeatherMethod],
  );
  const weatherBaselineMae = mean(weatherBaselineErrors);
  const matchedWaterMae = mean(matchedWaterErrors);
  const weatherMae = mean(weatherModelErrors);
  const weatherImprovementPct = weatherBaselineMae > 0
    ? ((weatherBaselineMae - weatherMae) / weatherBaselineMae) * 100
    : 0;
  const weatherGainPct = matchedWaterMae > 0
    ? ((matchedWaterMae - weatherMae) / matchedWaterMae) * 100
    : 0;

  const nextWaterPredictions = candidatePredictions(series, horizon);
  const waterPrediction = nextWaterPredictions[bestWaterMethod];
  const current = series.at(-1)!;
  const forecastRain = currentRainForOrigin(weather, current.date, horizon);
  const nextWeatherPredictions = weatherCandidatePredictions(
    series,
    horizon,
    weather,
    forecastRain,
  );
  const weatherPrediction = nextWeatherPredictions[bestWeatherMethod];
  const waterPassed =
    qualityReady &&
    waterSelectionRecords.length >= 40 &&
    waterValidationRecords.length >= 80 &&
    waterPrediction !== null &&
    waterImprovementPct >= 5;
  const weatherPassed =
    qualityReady &&
    weather.status === "connected" &&
    weather.historyCoverageRate >= 90 &&
    weatherSelectionRecords.length >= 40 &&
    weatherValidationRecords.length >= 80 &&
    forecastRain !== null &&
    weatherPrediction !== null &&
    weatherImprovementPct >= 5 &&
    weatherGainPct >= 2;

  const adoption = weatherPassed ? "weather" : waterPassed ? "water" : "hold";
  const candidatePrediction = weatherPrediction ?? waterPrediction ?? current.rate;
  const selectedPrediction = weatherPassed
    ? weatherPrediction
    : waterPassed
      ? waterPrediction
      : candidatePrediction;
  const usingWeatherCandidate = weatherPassed || (
    adoption === "hold" && weatherPrediction !== null
  );
  const selectedErrors = usingWeatherCandidate
    ? weatherModelErrors
    : waterModelErrors;
  const errorBand = Math.max(0.5, quantile(selectedErrors, 0.8));
  const predictedRate = Number((selectedPrediction ?? current.rate).toFixed(1));
  const forecastDate = parseDate(current.date);
  forecastDate?.setUTCDate(forecastDate.getUTCDate() + horizon);

  let reason = `강수예보 결합이 기준모형보다 오차를 ${weatherImprovementPct.toFixed(1)}%, v0.3보다 ${weatherGainPct.toFixed(1)}% 줄여 채택했습니다.`;
  if (!qualityReady) {
    reason = "365일 데이터 품질 판정을 먼저 통과해야 합니다.";
  } else if (weatherPassed) {
    reason = `강수예보 결합이 기준모형보다 오차를 ${weatherImprovementPct.toFixed(1)}%, v0.3보다 ${weatherGainPct.toFixed(1)}% 줄여 채택했습니다.`;
  } else if (waterPassed && weather.status !== "connected") {
    reason = `날씨 연결은 재시도 중입니다. 검증을 통과한 v0.3 ${methodLabel(bestWaterMethod)} 모형을 유지합니다.`;
  } else if (waterPassed) {
    reason = `날씨 결합의 v0.3 대비 개선폭이 ${weatherGainPct.toFixed(1)}%로 채택 기준 2%에 미치지 못해 기존 모형을 유지합니다.`;
  } else if (waterSelectionRecords.length < 40 || weatherSelectionRecords.length < 40) {
    reason = "모형 선택용 과거 표본이 40회에 미치지 못했습니다.";
  } else if (waterValidationRecords.length < 80 || weatherValidationRecords.length < 80) {
    reason = "별도 검증 표본이 80회에 미치지 못했습니다.";
  } else {
    reason = `기존 모형(${waterImprovementPct.toFixed(1)}%)과 날씨 결합(${weatherImprovementPct.toFixed(1)}%) 모두 공개 기준을 넘지 못했습니다.`;
  }

  const selectedMethodKey = usingWeatherCandidate ? bestWeatherMethod : bestWaterMethod;
  const selectedMethodLabel = usingWeatherCandidate
    ? weatherMethodLabel(bestWeatherMethod)
    : methodLabel(bestWaterMethod);
  const selectionTests = weather.status === "connected"
    ? weatherSelectionRecords.length
    : waterSelectionRecords.length;
  const validationTests = weather.status === "connected"
    ? weatherValidationRecords.length
    : waterValidationRecords.length;
  const validationPeriod = weather.status === "connected"
    ? weatherValidationRecords
    : waterValidationRecords;

  return {
    horizon,
    forecastDate: forecastDate ? yyyymmdd(forecastDate) : "",
    predictedRate,
    change: Number((predictedRate - current.rate).toFixed(1)),
    interval: {
      lower: Number(clampRate(predictedRate - errorBand).toFixed(1)),
      upper: Number(clampRate(predictedRate + errorBand).toFixed(1)),
      coverage: 80,
    },
    decision: adoption === "hold" ? "hold" as const : "pass" as const,
    adoption,
    decisionLabel: weatherPassed
      ? "날씨 결합 채택"
      : waterPassed
        ? "기존 모형 유지"
        : "예측 보류",
    reason,
    rainfallForecast: forecastRain,
    model: {
      key: selectedMethodKey,
      label: selectedMethodLabel,
    },
    weatherModel: {
      key: bestWeatherMethod,
      label: weatherMethodLabel(bestWeatherMethod),
    },
    backtest: {
      selectionTests,
      tests: validationTests,
      periodStart: validationPeriod[0]?.date ?? "",
      periodEnd: validationPeriod.at(-1)?.date ?? "",
      baselineMae: Number((weatherBaselineMae || waterBaselineMae).toFixed(3)),
      waterMae: Number((matchedWaterMae || waterMae).toFixed(3)),
      modelMae: weatherValidationRecords.length ? Number(weatherMae.toFixed(3)) : null,
      waterImprovementPct: Number(waterImprovementPct.toFixed(1)),
      improvementPct: weatherValidationRecords.length
        ? Number(weatherImprovementPct.toFixed(1))
        : null,
      weatherGainPct: weatherValidationRecords.length
        ? Number(weatherGainPct.toFixed(1))
        : null,
    },
  };
}

function forecastLabFor(
  series: Reading[],
  verdictLevel: "ready" | "short" | "diagnostic",
  weather: WeatherBundle,
) {
  const qualityReady = verdictLevel === "ready";
  const current = series.at(-1)!;
  const outlook = Array.from({ length: 3 }, (_, index) =>
    weather.outlook.find((day) => day.date === addDaysKey(current.date, index + 1)),
  ).filter((day): day is WeatherOutlookDay => Boolean(day));
  const oneDayRain = currentRainForOrigin(weather, current.date, 1);
  const threeDayRain = currentRainForOrigin(weather, current.date, 3);

  let weatherSummary = "강수예보 연결을 확인하고 있습니다.";
  let farmerAction = "현재 저수율 진단을 우선 확인하고, 현장 예보를 함께 보세요.";
  if (threeDayRain !== null && threeDayRain >= 30) {
    weatherSummary = `앞으로 3일간 ${threeDayRain.toFixed(1)}mm의 많은 비가 예보됐습니다.`;
    farmerAction = "관수 전 배수로와 포장 상태를 먼저 확인하고, 급수 일정은 관할 안내와 함께 조정하세요.";
  } else if (threeDayRain !== null && threeDayRain >= 10) {
    weatherSummary = `앞으로 3일간 ${threeDayRain.toFixed(1)}mm의 비가 예보됐습니다.`;
    farmerAction = "관수 시점을 정하기 전에 비가 오는 날과 토양 상태를 한 번 더 확인하세요.";
  } else if (threeDayRain !== null && threeDayRain > 0) {
    weatherSummary = `앞으로 3일간 예상 강수량은 ${threeDayRain.toFixed(1)}mm입니다.`;
    farmerAction = "비의 양이 적을 수 있으니 기존 관수 계획과 현장 토양 상태를 함께 살펴보세요.";
  } else if (threeDayRain !== null) {
    weatherSummary = "앞으로 3일간 뚜렷한 비 예보가 없습니다.";
    farmerAction = "저수율 흐름과 작물 상태를 기준으로 관수 계획을 점검하세요.";
  }

  return {
    version: "물때AI v0.4",
    status: "실험",
    baseline: "지속성 기준모형(미래 저수율 = 오늘 저수율)",
    releaseRule: "날씨 모형은 기준모형 5%·v0.3 2% 이상 개선해야 채택",
    leakageGuard: "과거 각 날짜에 당시 발표된 1·2·3일 전 강수예보만 사용",
    weather: {
      connected: weather.status === "connected",
      source: weather.source,
      model: weather.model,
      latitude: weather.latitude,
      longitude: weather.longitude,
      historyCoverageRate: weather.historyCoverageRate,
      oneDayRain,
      threeDayRain,
      outlook,
      summary: weatherSummary,
      action: farmerAction,
      note: weather.note,
    },
    horizons: [
      horizonForecast(series, 1, qualityReady, weather),
      horizonForecast(series, 3, qualityReady, weather),
    ],
  };
}

function payloadFor(
  source: "sample" | "krc",
  key: ReservoirKey,
  facility: { code: string; name: string; county: string },
  raw: RawReading[],
  requestedFrom: string,
  requestedTo: string,
  weather: WeatherBundle,
) {
  const config = RESERVOIRS[key];
  const diagnostics = diagnosticsFor(raw, requestedFrom, requestedTo);
  if (!diagnostics.series.length) {
    throw new Error("최근 365일에 유효한 수위정보가 없습니다.");
  }
  const recent = diagnostics.series.slice(-7);
  const current = recent.at(-1)!;
  const forecast = forecastLabFor(
    diagnostics.series,
    diagnostics.verdict.level,
    weather,
  );
  return {
    source,
    reservoir: {
      key,
      code: facility.code,
      name: config.name,
      apiName: facility.name,
      county: facility.county || config.county,
      region: config.region,
      reason: config.reason,
    },
    current,
    series: recent,
    history: diagnostics.series,
    status: statusFor(current.rate),
    trend: trendFor(recent),
    diagnostics: {
      summary: diagnostics.summary,
      months: diagnostics.months,
      verdict: diagnostics.verdict,
      requestedFrom,
      requestedTo,
      standard: "물때AI v0.2 내부 진단 기준",
    },
    forecast,
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const key = requestUrl.searchParams.get("reservoir") ?? "tapjeong";
  if (!(key in RESERVOIRS)) {
    return Response.json(
      { error: "현재 진단판에서 지원하지 않는 저수지입니다." },
      { status: 400 },
    );
  }

  const safeKey = key as ReservoirKey;
  const config = RESERVOIRS[safeKey];
  const requestedFrom = dateDaysAgo(REQUESTED_DAYS - 1);
  const requestedTo = dateDaysAgo(0);
  const apiKey = getApiKey();

  if (!apiKey) {
    const weather = await requestWeather(config, requestedFrom, requestedTo).catch((error) =>
      unavailableWeather(
        config,
        error instanceof Error ? error.message : "강수예보를 불러오지 못했습니다.",
      ),
    );
    return Response.json(
      payloadFor(
        "sample",
        safeKey,
        { code: "sample", name: config.lookupName, county: config.county },
        sampleSeries(),
        requestedFrom,
        requestedTo,
        weather,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const facility = resolveFacility(config);
    const [xml, weather] = await Promise.all([
      requestKrc(
        "reservoirlevel",
        new URLSearchParams({
          serviceKey: apiKey,
          pageNo: "1",
          numOfRows: "400",
          fac_code: facility.code,
          date_s: requestedFrom,
          date_e: requestedTo,
        }),
      ),
      requestWeather(config, requestedFrom, requestedTo).catch((error) =>
        unavailableWeather(
          config,
          error instanceof Error ? error.message : "강수예보를 불러오지 못했습니다.",
        ),
      ),
    ]);
    const readings = parseReadings(xml);
    return Response.json(
      payloadFor("krc", safeKey, facility, readings, requestedFrom, requestedTo, weather),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return Response.json(
      { error: `KRC 수위정보를 불러오지 못했습니다. ${message}` },
      { status: 502 },
    );
  }
}
