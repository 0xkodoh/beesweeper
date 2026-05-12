import { NextResponse } from "next/server";

type Difficulty = "Easy" | "Medium" | "Hard";
type ScoreEntry = {
  id: string;
  player: string;
  score: number;
  difficulty: Difficulty;
  elapsed: number;
  timestamp: number;
  status?: "offchain" | "onchain";
  txHash?: string;
};
type SupabaseScoreRow = {
  id: string;
  player: string;
  score: number;
  difficulty: string;
  elapsed: number;
  timestamp: number;
  status: string;
  tx_hash: string | null;
};

const MAX_SCORES = 10;
const MAX_HISTORY = 100;
const walletAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const difficulties: Difficulty[] = ["Easy", "Medium", "Hard"];
const difficultyConfigs: Record<Difficulty, { size: number; bees: number }> = {
  Easy: { size: 8, bees: 8 },
  Medium: { size: 10, bees: 15 },
  Hard: { size: 12, bees: 25 },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const getSupabaseConfig = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid Supabase URL");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Invalid Supabase URL");
  }

  return { url: url.replace(/\/$/, ""), serviceRoleKey };
};

const throwSupabaseResponseError = async (context: string, response: Response) => {
  await response.arrayBuffer().catch(() => undefined);
  throw new Error(`${context} failed`);
};

const supabaseFetch = async (path: string, init: RequestInit = {}) => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const headers = new Headers(init.headers);

  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept-Profile", "public");
  headers.set("Content-Profile", "public");

  try {
    return await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new Error("Supabase request failed");
  }
};

const normalizeScores = (scores: ScoreEntry[]) => {
  return scores
    .filter(isValidScoreEntry)
    .sort((first, second) => second.score - first.score || first.elapsed - second.elapsed || second.timestamp - first.timestamp)
    .slice(0, MAX_SCORES);
};

const normalizeScoresForDifficulty = (scores: ScoreEntry[], difficulty?: Difficulty) => {
  return normalizeScores(difficulty ? scores.filter((score) => score.difficulty === difficulty) : scores);
};

const normalizeHistory = (scores: ScoreEntry[]) => {
  return scores.filter(isValidScoreEntry).sort((first, second) => second.timestamp - first.timestamp).slice(0, MAX_HISTORY);
};

const getMaxScoreForDifficulty = (difficulty: Difficulty) => {
  const config = difficultyConfigs[difficulty];

  return (config.size * config.size - config.bees) * 10;
};

const isValidScoreEntry = (entry: ScoreEntry) => {
  return (
    walletAddressPattern.test(entry.player) &&
    Number.isFinite(entry.score) &&
    entry.score > 0 &&
    Number.isFinite(entry.elapsed) &&
    entry.elapsed >= 0 &&
    Number.isFinite(entry.timestamp) &&
    difficulties.includes(entry.difficulty) &&
    entry.score <= getMaxScoreForDifficulty(entry.difficulty) &&
    (entry.status === undefined || entry.status === "offchain" || entry.status === "onchain")
  );
};

const isScoreEntry = (entry: unknown): entry is ScoreEntry => {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const candidate = entry as Partial<ScoreEntry>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.player === "string" &&
    walletAddressPattern.test(candidate.player) &&
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    candidate.score > 0 &&
    difficulties.includes(candidate.difficulty as Difficulty) &&
    candidate.score <= getMaxScoreForDifficulty(candidate.difficulty as Difficulty) &&
    typeof candidate.elapsed === "number" &&
    Number.isFinite(candidate.elapsed) &&
    candidate.elapsed >= 0 &&
    typeof candidate.timestamp === "number" &&
    Number.isFinite(candidate.timestamp) &&
    (candidate.status === undefined || candidate.status === "offchain" || candidate.status === "onchain") &&
    (candidate.txHash === undefined || typeof candidate.txHash === "string")
  );
};

const fromSupabaseRow = (row: SupabaseScoreRow): ScoreEntry | null => {
  const entry: ScoreEntry = {
    id: row.id,
    player: row.player,
    score: Number(row.score),
    difficulty: row.difficulty as Difficulty,
    elapsed: Number(row.elapsed),
    timestamp: Number(row.timestamp),
    status: row.status as "offchain" | "onchain",
    txHash: row.tx_hash ?? undefined,
  };

  return isScoreEntry(entry) ? entry : null;
};

const toSupabaseRow = (entry: ScoreEntry) => ({
  id: entry.id,
  player: entry.player,
  score: entry.score,
  difficulty: entry.difficulty,
  elapsed: entry.elapsed,
  timestamp: entry.timestamp,
  status: entry.status ?? "offchain",
  tx_hash: entry.txHash ?? null,
});

const readScores = async (view: "leaderboard" | "history" = "leaderboard", difficulty?: Difficulty) => {
  const query =
    view === "history"
      ? `scores?select=*&order=timestamp.desc&limit=${MAX_HISTORY}`
      : `scores?select=*&order=score.desc,elapsed.asc,timestamp.desc&limit=${MAX_SCORES}${
          difficulty ? `&difficulty=eq.${encodeURIComponent(difficulty)}` : ""
        }`;
  const response = await supabaseFetch(
    query,
  );

  if (!response.ok) {
    await throwSupabaseResponseError("Read scores", response);
  }

  const rows = (await response.json()) as SupabaseScoreRow[];

  if (!Array.isArray(rows)) {
    return [];
  }

  const entries = rows.map(fromSupabaseRow).filter((entry): entry is ScoreEntry => Boolean(entry));

  return view === "history" ? normalizeHistory(entries) : normalizeScoresForDifficulty(entries, difficulty);
};

const createScoreEntry = (body: unknown): { entry: ScoreEntry | null; error: string } => {
  if (!body || typeof body !== "object") {
    return { entry: null, error: "Invalid score" };
  }

  const candidate = body as Partial<ScoreEntry>;
  const score = Number(candidate.score);
  const elapsed = Number(candidate.elapsed);
  const timestamp = Number(candidate.timestamp);
  const difficulty = candidate.difficulty;
  const status = candidate.status;

  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return { entry: null, error: "Invalid score" };
  }

  if (typeof candidate.player !== "string" || !walletAddressPattern.test(candidate.player)) {
    return { entry: null, error: "Invalid player" };
  }

  if (!difficulty || !difficulties.includes(difficulty)) {
    return { entry: null, error: "Invalid difficulty" };
  }

  if (
    !Number.isFinite(score) ||
    score <= 0 ||
    !Number.isFinite(elapsed) ||
    elapsed < 0 ||
    !Number.isFinite(timestamp) ||
    score > getMaxScoreForDifficulty(difficulty) ||
    (status !== "offchain" && status !== "onchain")
  ) {
    return { entry: null, error: "Invalid score" };
  }

  return {
    entry: {
      id: candidate.id,
      player: candidate.player,
      score: Math.floor(score),
      difficulty,
      elapsed: Math.floor(elapsed),
      timestamp,
      status,
      txHash: typeof candidate.txHash === "string" && candidate.txHash.length > 0 ? candidate.txHash : undefined,
    },
    error: "",
  };
};

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const view = params.get("view");
    const difficultyParam = params.get("difficulty");
    const difficulty = difficulties.includes(difficultyParam as Difficulty) ? (difficultyParam as Difficulty) : undefined;
    const scores = await readScores(view === "history" ? "history" : "leaderboard", view === "history" ? undefined : difficulty);

    return NextResponse.json(view === "history" ? normalizeHistory(scores) : normalizeScoresForDifficulty(scores, difficulty));
  } catch {
    return NextResponse.json({ error: "Unable to load scores" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { entry, error } = createScoreEntry(body);

  if (!entry || !isValidScoreEntry(entry)) {
    return NextResponse.json({ error: error || "Invalid score" }, { status: 400 });
  }

  try {
    const existingResponse = await supabaseFetch(
      `scores?select=id,player,score,difficulty,elapsed,timestamp,status,tx_hash&id=eq.${encodeURIComponent(entry.id)}&limit=1`,
    );

    if (!existingResponse.ok) {
      await throwSupabaseResponseError("Check existing score", existingResponse);
    }

    const existingRows = (await existingResponse.json()) as SupabaseScoreRow[];
    const existingEntry = Array.isArray(existingRows) && existingRows[0] ? fromSupabaseRow(existingRows[0]) : null;
    const samePlayer = existingEntry?.player.toLowerCase() === entry.player.toLowerCase();
    const entryIsOnchain = entry.status === "onchain";
    const existingIsOnchain = existingEntry ? existingEntry.status === "onchain" || Boolean(existingEntry.txHash) : false;

    if (existingEntry && !samePlayer) {
      return NextResponse.json({ error: "Duplicate submission" }, { status: 409 });
    }

    if (samePlayer && entryIsOnchain && existingIsOnchain) {
      return NextResponse.json({ error: "Duplicate submission" }, { status: 409 });
    }

    const writeResponse = existingEntry
      ? await supabaseFetch(`scores?id=eq.${encodeURIComponent(entry.id)}`, {
          method: "PATCH",
          headers: {
            Prefer: "return=minimal",
          },
          body: JSON.stringify(toSupabaseRow(entry)),
        })
      : await supabaseFetch("scores", {
          method: "POST",
          headers: {
            Prefer: "return=minimal",
          },
          body: JSON.stringify(toSupabaseRow(entry)),
        });

    if (!writeResponse.ok) {
      await throwSupabaseResponseError("Save score", writeResponse);
    }

    const scores = await readScores("leaderboard", entry.difficulty);

    return NextResponse.json(normalizeScoresForDifficulty(scores, entry.difficulty));
  } catch {
    return NextResponse.json({ error: "Unable to save score" }, { status: 500 });
  }
}
