import { and, count, desc, eq, notLike, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { farmActionLog } from "../../../db/schema";

const RESERVOIRS = new Set(["idong", "tapjeong", "naju", "seongju", "hadong"]);
const CROPS = new Set(["rice", "field", "orchard", "greenhouse"]);
const STAGES = new Set(["rooting", "growth", "flowering", "preharvest"]);
const MOISTURE = new Set(["wet", "normal", "dry"]);
const SOURCES = new Set(["sample", "krc"]);
const DECISIONS = new Set(["pass", "hold"]);
const ADOPTIONS = new Set(["weather", "water", "hold"]);
const ACTUAL_RAIN = new Set(["none", "light", "heavy", "unknown"]);
const ACTION_TAKEN = new Set(["followed", "adjusted", "skipped"]);
const HELPFULNESS = new Set(["helpful", "mixed", "not_helpful"]);

type ActionLogPayload = {
  mode?: "save" | "followup";
  participantId?: string;
  id?: string;
  observationKey?: string;
  reservoirKey?: string;
  reservoirName?: string;
  observationDate?: string;
  actionTitle?: string;
  actionTone?: string;
  crop?: string;
  stage?: string;
  initialMoisture?: string;
  dataSource?: string;
  currentRate?: number;
  waterStatus?: string;
  threeDayRain?: number | null;
  forecastDecision?: string;
  forecastAdoption?: string;
  actualRain?: string;
  nextMoisture?: string;
  actionTaken?: string;
  helpfulness?: string;
};

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function validParticipant(value: string) {
  return /^[a-zA-Z0-9-]{8,80}$/.test(value);
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

async function getSummary() {
  const db = await getDb();
  const [row] = await db
    .select({
      total: count(farmActionLog.id),
      participants: sql<number>`count(distinct ${farmActionLog.participantId})`,
      completed: sql<number>`coalesce(sum(case when ${farmActionLog.status} = 'completed' then 1 else 0 end), 0)`,
      helpful: sql<number>`coalesce(sum(case when ${farmActionLog.helpfulness} = 'helpful' then 1 else 0 end), 0)`,
      adjusted: sql<number>`coalesce(sum(case when ${farmActionLog.actionTaken} = 'adjusted' then 1 else 0 end), 0)`,
    })
    .from(farmActionLog)
    .where(notLike(farmActionLog.participantId, "qa-%"));

  const total = Number(row?.total ?? 0);
  const completed = Number(row?.completed ?? 0);
  const helpful = Number(row?.helpful ?? 0);

  return {
    total,
    participants: Number(row?.participants ?? 0),
    completed,
    pending: Math.max(0, total - completed),
    completionRate: percent(completed, total),
    helpfulRate: percent(helpful, completed),
    adjusted: Number(row?.adjusted ?? 0),
  };
}

async function getRecords(participantId: string) {
  const db = await getDb();
  return db
    .select({
      id: farmActionLog.id,
      status: farmActionLog.status,
      reservoirKey: farmActionLog.reservoirKey,
      reservoirName: farmActionLog.reservoirName,
      observationDate: farmActionLog.observationDate,
      actionTitle: farmActionLog.actionTitle,
      actionTone: farmActionLog.actionTone,
      crop: farmActionLog.crop,
      stage: farmActionLog.stage,
      initialMoisture: farmActionLog.initialMoisture,
      currentRate: farmActionLog.currentRate,
      waterStatus: farmActionLog.waterStatus,
      threeDayRain: farmActionLog.threeDayRain,
      actualRain: farmActionLog.actualRain,
      nextMoisture: farmActionLog.nextMoisture,
      actionTaken: farmActionLog.actionTaken,
      helpfulness: farmActionLog.helpfulness,
      createdAt: farmActionLog.createdAt,
      completedAt: farmActionLog.completedAt,
    })
    .from(farmActionLog)
    .where(eq(farmActionLog.participantId, participantId))
    .orderBy(desc(farmActionLog.createdAt))
    .limit(12);
}

function databaseError() {
  return Response.json(
    { error: "행동카드 기록 저장소를 준비하고 있습니다. 잠시 후 다시 시도해주세요." },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  try {
    const participantId = cleanText(
      new URL(request.url).searchParams.get("participantId"),
      80,
    );
    if (!validParticipant(participantId)) {
      return Response.json({ error: "익명 참여번호를 확인해주세요." }, { status: 400 });
    }

    return Response.json(
      {
        records: await getRecords(participantId),
        summary: await getSummary(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return databaseError();
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ActionLogPayload;
    const mode = payload.mode;
    const participantId = cleanText(payload.participantId, 80);
    if (!validParticipant(participantId)) {
      return Response.json({ error: "익명 참여번호를 확인해주세요." }, { status: 400 });
    }

    const db = await getDb();
    const updatedAt = new Date().toISOString();

    if (mode === "followup") {
      const id = cleanText(payload.id, 80);
      const actualRain = cleanText(payload.actualRain, 20);
      const nextMoisture = cleanText(payload.nextMoisture, 20);
      const actionTaken = cleanText(payload.actionTaken, 20);
      const helpfulness = cleanText(payload.helpfulness, 20);
      if (
        !id ||
        !ACTUAL_RAIN.has(actualRain) ||
        !MOISTURE.has(nextMoisture) ||
        !ACTION_TAKEN.has(actionTaken) ||
        !HELPFULNESS.has(helpfulness)
      ) {
        return Response.json({ error: "사후 확인 항목을 모두 선택해주세요." }, { status: 400 });
      }

      const [updated] = await db
        .update(farmActionLog)
        .set({
          status: "completed",
          actualRain,
          nextMoisture,
          actionTaken,
          helpfulness,
          updatedAt,
          completedAt: updatedAt,
        })
        .where(and(
          eq(farmActionLog.id, id),
          eq(farmActionLog.participantId, participantId),
        ))
        .returning({ id: farmActionLog.id });

      if (!updated) {
        return Response.json({ error: "확인할 행동카드 기록을 찾지 못했습니다." }, { status: 404 });
      }

      return Response.json({
        saved: true,
        operation: "completed",
        records: await getRecords(participantId),
        summary: await getSummary(),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (mode !== "save") {
      return Response.json({ error: "저장 방식을 확인해주세요." }, { status: 400 });
    }

    const observationKey = cleanText(payload.observationKey, 320);
    const reservoirKey = cleanText(payload.reservoirKey, 30);
    const reservoirName = cleanText(payload.reservoirName, 60);
    const observationDate = cleanText(payload.observationDate, 8);
    const actionTitle = cleanText(payload.actionTitle, 140);
    const actionTone = cleanText(payload.actionTone, 30);
    const crop = cleanText(payload.crop, 30);
    const stage = cleanText(payload.stage, 30);
    const initialMoisture = cleanText(payload.initialMoisture, 30);
    const dataSource = cleanText(payload.dataSource, 20);
    const waterStatus = cleanText(payload.waterStatus, 40);
    const forecastDecision = cleanText(payload.forecastDecision, 20);
    const forecastAdoption = cleanText(payload.forecastAdoption, 20);
    const invalid =
      !observationKey ||
      !RESERVOIRS.has(reservoirKey) ||
      !reservoirName ||
      !/^\d{8}$/.test(observationDate) ||
      !actionTitle ||
      !actionTone ||
      !CROPS.has(crop) ||
      !STAGES.has(stage) ||
      !MOISTURE.has(initialMoisture) ||
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
      return Response.json({ error: "행동카드 저장 항목을 다시 확인해주세요." }, { status: 400 });
    }

    const [existing] = await db
      .select({ id: farmActionLog.id })
      .from(farmActionLog)
      .where(and(
        eq(farmActionLog.participantId, participantId),
        eq(farmActionLog.observationKey, observationKey),
      ))
      .limit(1);

    await db
      .insert(farmActionLog)
      .values({
        id: crypto.randomUUID(),
        participantId,
        observationKey,
        reservoirKey,
        reservoirName,
        observationDate,
        actionTitle,
        actionTone,
        crop,
        stage,
        initialMoisture,
        dataSource,
        currentRate: payload.currentRate!,
        waterStatus,
        threeDayRain: payload.threeDayRain ?? null,
        forecastDecision,
        forecastAdoption,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [farmActionLog.participantId, farmActionLog.observationKey],
        set: {
          reservoirName,
          actionTitle,
          actionTone,
          dataSource,
          currentRate: payload.currentRate!,
          waterStatus,
          threeDayRain: payload.threeDayRain ?? null,
          forecastDecision,
          forecastAdoption,
          updatedAt,
        },
      });

    return Response.json({
      saved: true,
      operation: existing ? "updated" : "created",
      records: await getRecords(participantId),
      summary: await getSummary(),
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return databaseError();
  }
}
