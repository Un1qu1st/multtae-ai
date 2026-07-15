import { and, asc, count, desc, eq, isNotNull, notLike, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { farmFeedback } from "../../../db/schema";

const RESERVOIRS = new Set(["idong", "tapjeong", "naju", "seongju", "hadong"]);
const VERDICTS = new Set(["match", "different"]);
const REASONS = new Set(["rain", "moisture", "supply", "crop", "other"]);
const CLARITY = new Set(["easy", "okay", "hard"]);
const CROPS = new Set(["rice", "field", "orchard", "greenhouse"]);
const STAGES = new Set(["rooting", "growth", "flowering", "preharvest"]);
const MOISTURE = new Set(["wet", "normal", "dry"]);
const SOURCES = new Set(["sample", "krc"]);
const DECISIONS = new Set(["pass", "hold"]);
const ADOPTIONS = new Set(["weather", "water", "hold"]);

type FeedbackPayload = {
  participantId?: string;
  observationKey?: string;
  verdict?: string;
  reason?: string | null;
  clarity?: string;
  reservoirKey?: string;
  reservoirName?: string;
  observationDate?: string;
  actionTitle?: string;
  actionTone?: string;
  crop?: string;
  stage?: string;
  moisture?: string;
  dataSource?: string;
  currentRate?: number;
  waterStatus?: string;
  threeDayRain?: number | null;
  forecastDecision?: string;
  forecastAdoption?: string;
};

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

type CohortFeedback = {
  participantId: string;
  verdict: string;
  reason: string | null;
  clarity: string;
  reservoirKey: string;
  reservoirName: string;
  crop: string;
  stage: string;
  moisture: string;
  dataSource: string;
  createdAt: string;
  updatedAt: string;
};

type FeedbackDatabase = Awaited<ReturnType<typeof getDb>>;

function summarizeFirstCohort(rows: CohortFeedback[]) {
  const matching = rows.filter((item) => item.verdict === "match").length;
  const different = rows.filter((item) => item.verdict === "different").length;
  const easy = rows.filter((item) => item.clarity === "easy").length;
  const okay = rows.filter((item) => item.clarity === "okay").length;
  const hard = rows.filter((item) => item.clarity === "hard").length;
  const krc = rows.filter((item) => item.dataSource === "krc").length;

  const countKeys = (values: string[]) => {
    const totals = new Map<string, number>();
    values.forEach((value) => totals.set(value, (totals.get(value) ?? 0) + 1));
    return [...totals.entries()]
      .map(([key, total]) => ({ key, total }))
      .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  };

  const reservoirTotals = new Map<string, { label: string; total: number }>();
  rows.forEach((item) => {
    const current = reservoirTotals.get(item.reservoirKey);
    reservoirTotals.set(item.reservoirKey, {
      label: item.reservoirName,
      total: (current?.total ?? 0) + 1,
    });
  });

  const reasonTotals = new Map<string, number>();
  rows.forEach((item) => {
    if (item.verdict !== "different" || !item.reason) return;
    reasonTotals.set(item.reason, (reasonTotals.get(item.reason) ?? 0) + 1);
  });

  return {
    target: 3,
    frozen: rows.length === 3,
    total: rows.length,
    participants: rows.length,
    matchRate: percent(matching, rows.length),
    easyRate: percent(easy, rows.length),
    counts: { matching, different, easy, okay, hard, krc },
    period: {
      firstRecordedAt: rows[0]?.createdAt ?? null,
      lastRecordedAt: rows.at(-1)?.updatedAt ?? null,
    },
    reasons: [...reasonTotals.entries()]
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total || a.reason.localeCompare(b.reason)),
    coverage: {
      reservoirs: [...reservoirTotals.entries()]
        .map(([key, value]) => ({ key, label: value.label, total: value.total }))
        .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)),
      crops: countKeys(rows.map((item) => item.crop)),
      stages: countKeys(rows.map((item) => item.stage)),
      moisture: countKeys(rows.map((item) => item.moisture)),
    },
  };
}

async function getFirstCohortRows(db: FeedbackDatabase) {
  const candidates = await db
    .select({
      participantId: farmFeedback.participantId,
      verdict: farmFeedback.verdict,
      reason: farmFeedback.reason,
      clarity: farmFeedback.clarity,
      reservoirKey: farmFeedback.reservoirKey,
      reservoirName: farmFeedback.reservoirName,
      crop: farmFeedback.crop,
      stage: farmFeedback.stage,
      moisture: farmFeedback.moisture,
      dataSource: farmFeedback.dataSource,
      createdAt: farmFeedback.createdAt,
      updatedAt: farmFeedback.updatedAt,
    })
    .from(farmFeedback)
    .where(notLike(farmFeedback.participantId, "qa-%"))
    .orderBy(asc(farmFeedback.createdAt), asc(farmFeedback.id))
    .limit(500);

  const firstCohortRows: CohortFeedback[] = [];
  const cohortParticipants = new Set<string>();
  for (const item of candidates) {
    if (cohortParticipants.has(item.participantId)) continue;
    cohortParticipants.add(item.participantId);
    firstCohortRows.push(item);
    if (firstCohortRows.length === 3) break;
  }
  return firstCohortRows;
}

async function getSummary() {
  const db = await getDb();
  const [row] = await db
    .select({
      total: count(farmFeedback.id),
      participants: sql<number>`count(distinct ${farmFeedback.participantId})`,
      matching: sql<number>`coalesce(sum(case when ${farmFeedback.verdict} = 'match' then 1 else 0 end), 0)`,
      different: sql<number>`coalesce(sum(case when ${farmFeedback.verdict} = 'different' then 1 else 0 end), 0)`,
      easy: sql<number>`coalesce(sum(case when ${farmFeedback.clarity} = 'easy' then 1 else 0 end), 0)`,
      okay: sql<number>`coalesce(sum(case when ${farmFeedback.clarity} = 'okay' then 1 else 0 end), 0)`,
      hard: sql<number>`coalesce(sum(case when ${farmFeedback.clarity} = 'hard' then 1 else 0 end), 0)`,
      krc: sql<number>`coalesce(sum(case when ${farmFeedback.dataSource} = 'krc' then 1 else 0 end), 0)`,
      firstRecordedAt: sql<string | null>`min(${farmFeedback.createdAt})`,
      lastRecordedAt: sql<string | null>`max(${farmFeedback.updatedAt})`,
    })
    .from(farmFeedback)
    .where(notLike(farmFeedback.participantId, "qa-%"));

  const reasonRows = await db
    .select({
      reason: farmFeedback.reason,
      total: count(farmFeedback.id),
    })
    .from(farmFeedback)
    .where(and(
      notLike(farmFeedback.participantId, "qa-%"),
      eq(farmFeedback.verdict, "different"),
      isNotNull(farmFeedback.reason),
    ))
    .groupBy(farmFeedback.reason)
    .orderBy(desc(count(farmFeedback.id)));

  const reservoirRows = await db
    .select({
      key: farmFeedback.reservoirKey,
      label: farmFeedback.reservoirName,
      total: count(farmFeedback.id),
    })
    .from(farmFeedback)
    .where(notLike(farmFeedback.participantId, "qa-%"))
    .groupBy(farmFeedback.reservoirKey, farmFeedback.reservoirName)
    .orderBy(desc(count(farmFeedback.id)));

  const cropRows = await db
    .select({
      key: farmFeedback.crop,
      total: count(farmFeedback.id),
    })
    .from(farmFeedback)
    .where(notLike(farmFeedback.participantId, "qa-%"))
    .groupBy(farmFeedback.crop)
    .orderBy(desc(count(farmFeedback.id)));

  const stageRows = await db
    .select({
      key: farmFeedback.stage,
      total: count(farmFeedback.id),
    })
    .from(farmFeedback)
    .where(notLike(farmFeedback.participantId, "qa-%"))
    .groupBy(farmFeedback.stage)
    .orderBy(desc(count(farmFeedback.id)));

  const moistureRows = await db
    .select({
      key: farmFeedback.moisture,
      total: count(farmFeedback.id),
    })
    .from(farmFeedback)
    .where(notLike(farmFeedback.participantId, "qa-%"))
    .groupBy(farmFeedback.moisture)
    .orderBy(desc(count(farmFeedback.id)));

  const firstCohortRows = await getFirstCohortRows(db);

  const total = Number(row?.total ?? 0);
  const matching = Number(row?.matching ?? 0);
  const different = Number(row?.different ?? 0);
  const easy = Number(row?.easy ?? 0);
  const okay = Number(row?.okay ?? 0);
  const hard = Number(row?.hard ?? 0);
  const krc = Number(row?.krc ?? 0);

  return {
    total,
    participants: Number(row?.participants ?? 0),
    matchRate: percent(matching, total),
    easyRate: percent(easy, total),
    counts: {
      matching,
      different,
      easy,
      okay,
      hard,
      krc,
    },
    period: {
      firstRecordedAt: row?.firstRecordedAt ?? null,
      lastRecordedAt: row?.lastRecordedAt ?? null,
    },
    reasons: reasonRows.map((item) => ({
      reason: item.reason,
      total: Number(item.total),
    })),
    coverage: {
      reservoirs: reservoirRows.map((item) => ({
        key: item.key,
        label: item.label,
        total: Number(item.total),
      })),
      crops: cropRows.map((item) => ({
        key: item.key,
        total: Number(item.total),
      })),
      stages: stageRows.map((item) => ({
        key: item.key,
        total: Number(item.total),
      })),
      moisture: moistureRows.map((item) => ({
        key: item.key,
        total: Number(item.total),
      })),
    },
    firstCohort: firstCohortRows.length === 3
      ? summarizeFirstCohort(firstCohortRows)
      : null,
  };
}

function databaseError() {
  return Response.json(
    { error: "현장 기록 저장소를 준비하고 있습니다. 잠시 후 다시 시도해주세요." },
    { status: 503 },
  );
}

export async function GET() {
  try {
    return Response.json(
      { summary: await getSummary() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return databaseError();
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as FeedbackPayload;
    const participantId = cleanText(payload.participantId, 80);
    const observationKey = cleanText(payload.observationKey, 320);
    const verdict = cleanText(payload.verdict, 20);
    const reason = payload.reason ? cleanText(payload.reason, 20) : null;
    const clarity = cleanText(payload.clarity, 20);
    const reservoirKey = cleanText(payload.reservoirKey, 30);
    const reservoirName = cleanText(payload.reservoirName, 60);
    const observationDate = cleanText(payload.observationDate, 8);
    const actionTitle = cleanText(payload.actionTitle, 140);
    const actionTone = cleanText(payload.actionTone, 30);
    const crop = cleanText(payload.crop, 30);
    const stage = cleanText(payload.stage, 30);
    const moisture = cleanText(payload.moisture, 30);
    const dataSource = cleanText(payload.dataSource, 20);
    const waterStatus = cleanText(payload.waterStatus, 40);
    const forecastDecision = cleanText(payload.forecastDecision, 20);
    const forecastAdoption = cleanText(payload.forecastAdoption, 20);

    const invalid =
      !participantId ||
      !observationKey ||
      !VERDICTS.has(verdict) ||
      (verdict === "different" && !REASONS.has(reason ?? "")) ||
      !CLARITY.has(clarity) ||
      !RESERVOIRS.has(reservoirKey) ||
      !reservoirName ||
      !/^\d{8}$/.test(observationDate) ||
      !actionTitle ||
      !actionTone ||
      !CROPS.has(crop) ||
      !STAGES.has(stage) ||
      !MOISTURE.has(moisture) ||
      !SOURCES.has(dataSource) ||
      !isFiniteNumber(payload.currentRate) ||
      payload.currentRate! < 0 ||
      payload.currentRate! > 100 ||
      !waterStatus ||
      (payload.threeDayRain !== null &&
        payload.threeDayRain !== undefined &&
        (!isFiniteNumber(payload.threeDayRain) || payload.threeDayRain < 0)) ||
      !DECISIONS.has(forecastDecision) ||
      !ADOPTIONS.has(forecastAdoption);

    if (invalid) {
      return Response.json(
        { error: "현장 기록 항목을 다시 확인해주세요." },
        { status: 400 },
      );
    }

    const db = await getDb();
    const updatedAt = new Date().toISOString();
    const [existing] = await db
      .select({ id: farmFeedback.id })
      .from(farmFeedback)
      .where(and(
        eq(farmFeedback.participantId, participantId),
        eq(farmFeedback.observationKey, observationKey),
      ))
      .limit(1);

    const firstCohortRows = await getFirstCohortRows(db);
    const firstCohortLocked = firstCohortRows.length === 3;
    const isFirstCohortParticipant = firstCohortRows.some(
      (item) => item.participantId === participantId,
    );
    if (existing && firstCohortLocked && isFirstCohortParticipant) {
      return Response.json(
        {
          saved: true,
          frozen: true,
          operation: "frozen",
          summary: await getSummary(),
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const values = {
      id: crypto.randomUUID(),
      participantId,
      observationKey,
      verdict,
      reason: verdict === "different" ? reason : null,
      clarity,
      reservoirKey,
      reservoirName,
      observationDate,
      actionTitle,
      actionTone,
      crop,
      stage,
      moisture,
      dataSource,
      currentRate: payload.currentRate!,
      waterStatus,
      threeDayRain: payload.threeDayRain ?? null,
      forecastDecision,
      forecastAdoption,
      updatedAt,
    };

    await db
      .insert(farmFeedback)
      .values(values)
      .onConflictDoUpdate({
        target: [farmFeedback.participantId, farmFeedback.observationKey],
        set: {
          verdict: values.verdict,
          reason: values.reason,
          clarity: values.clarity,
          reservoirName: values.reservoirName,
          actionTitle: values.actionTitle,
          actionTone: values.actionTone,
          dataSource: values.dataSource,
          currentRate: values.currentRate,
          waterStatus: values.waterStatus,
          threeDayRain: values.threeDayRain,
          forecastDecision: values.forecastDecision,
          forecastAdoption: values.forecastAdoption,
          updatedAt,
        },
      });

    return Response.json(
      {
        saved: true,
        operation: existing ? "updated" : "created",
        summary: await getSummary(),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return databaseError();
  }
}
