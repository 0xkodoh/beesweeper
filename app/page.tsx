"use client";

import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Hexagon,
  History,
  Info,
  Play,
  RotateCcw,
  ShieldAlert,
  Trophy,
  Wallet,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useConnect, useConnection, useDisconnect, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Hex } from "viem";
import { beeSweeperScoresAbi, beeSweeperScoresAddress } from "./contracts";
import { targetChain } from "./wagmi";

type Difficulty = "Easy" | "Medium" | "Hard";
type Screen = "start" | "game";
type GameStatus = "playing" | "stung" | "cleared";
type SubmissionPhase = "idle" | "confirming" | "pending" | "saving" | "success";
type Cell = {
  id: number;
  hasBee: boolean;
  revealed: boolean;
  adjacentBees: number;
};
type LeaderboardEntry = {
  id: string;
  player: string;
  score: number;
  difficulty: Difficulty;
  elapsed: number;
  timestamp: number;
  status?: "offchain" | "onchain";
  txHash?: Hex;
};

const difficulties: Array<{
  label: Difficulty;
  hint: string;
  size: number;
  bees: number;
}> = [
  { label: "Easy", hint: "Gentle buzz", size: 8, bees: 8 },
  { label: "Medium", hint: "Hive rhythm", size: 10, bees: 15 },
  { label: "Hard", hint: "Sting zone", size: 12, bees: 25 },
];

const adjacentTextColor: Record<number, string> = {
  1: "text-[#0052FF]",
  2: "text-[#148F5B]",
  3: "text-[#D15B18]",
  4: "text-[#7B61FF]",
  5: "text-[#C62859]",
  6: "text-[#008AA8]",
  7: "text-[#07121F]",
  8: "text-[#07121F]",
};

const BG_MUSIC_VOLUME = 0.096;
const BG_LOOP_LEAD_TIME = 0.12;
const LEADERBOARD_STORAGE_KEY = "beesweeper.leaderboard.v1";
const MAX_LEADERBOARD_ENTRIES = 10;
const HISTORY_PAGE_SIZE = 10;
const BASESCAN_TX_URL = "https://sepolia.basescan.org/tx";

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");

  return `${mins}:${secs}`;
};

const shortPlayerName = (player: string) => {
  if (!player.startsWith("0x") || player.length < 10) {
    return player;
  }

  return `${player.slice(0, 6)}...${player.slice(-4)}`;
};

const shortHash = (hash: string) => `${hash.slice(0, 6)}...${hash.slice(-4)}`;

const getBasescanTxUrl = (txHash: string) => `${BASESCAN_TX_URL}/${txHash}`;

const getSubmissionErrorMessage = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (code === "4001" || message.includes("reject") || message.includes("denied")) {
    return "Transaction rejected";
  }

  if (message.includes("network") || message.includes("rpc") || message.includes("fetch")) {
    return "Network issue, try again";
  }

  return "Transaction failed";
};

const isDifficulty = (difficulty: unknown): difficulty is Difficulty => {
  return difficulties.some((item) => item.label === difficulty);
};

const getMaxScoreForDifficulty = (difficulty: Difficulty) => {
  const config = getDifficultyConfig(difficulty);

  return (config.size * config.size - config.bees) * 10;
};

const isValidLeaderboardEntry = (entry: LeaderboardEntry) => {
  return (
    entry.player !== "Guest" &&
    entry.player.length > 0 &&
    Number.isFinite(entry.score) &&
    entry.score > 0 &&
    Number.isFinite(entry.elapsed) &&
    entry.elapsed >= 0 &&
    Number.isFinite(entry.timestamp) &&
    isDifficulty(entry.difficulty) &&
    entry.score <= getMaxScoreForDifficulty(entry.difficulty) &&
    (entry.status !== "onchain" || Boolean(entry.txHash))
  );
};

const formatHistoryDate = (timestamp: number) => {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

const normalizeLeaderboardEntries = (entries: LeaderboardEntry[]) => {
  return entries
    .filter((entry) => isValidLeaderboardEntry(entry) && (entry.status === "onchain" || Boolean(entry.txHash)))
    .sort((first, second) => second.score - first.score || first.elapsed - second.elapsed || second.timestamp - first.timestamp)
    .slice(0, MAX_LEADERBOARD_ENTRIES);
};

const normalizeHistoryEntries = (entries: LeaderboardEntry[]) => {
  return entries.filter(isValidLeaderboardEntry).sort((first, second) => second.timestamp - first.timestamp);
};

const filterHistoryForWallet = (entries: LeaderboardEntry[], walletAddress?: string) => {
  if (!walletAddress) {
    return [];
  }

  const normalizedWallet = walletAddress.toLowerCase();

  return entries.filter((entry) => entry.player.toLowerCase() === normalizedWallet);
};

const readSavedLeaderboard = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeLeaderboardEntries(
      parsed.filter((entry): entry is LeaderboardEntry => {
        const candidate = entry as Partial<LeaderboardEntry>;

        return (
          typeof entry?.id === "string" &&
          typeof candidate.player === "string" &&
          candidate.player !== "Guest" &&
          typeof candidate.score === "number" &&
          typeof candidate.elapsed === "number" &&
          typeof candidate.timestamp === "number" &&
          isDifficulty(candidate.difficulty) &&
          isValidLeaderboardEntry(candidate as LeaderboardEntry) &&
          (candidate.status === undefined || candidate.status === "offchain" || candidate.status === "onchain") &&
          (candidate.txHash === undefined || typeof candidate.txHash === "string")
        );
      }),
    );
  } catch {
    return [];
  }
};

const readSavedHistory = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeHistoryEntries(
      parsed.filter((entry): entry is LeaderboardEntry => {
        const candidate = entry as Partial<LeaderboardEntry>;

        return (
          typeof entry?.id === "string" &&
          typeof candidate.player === "string" &&
          candidate.player !== "Guest" &&
          typeof candidate.score === "number" &&
          typeof candidate.elapsed === "number" &&
          typeof candidate.timestamp === "number" &&
          isDifficulty(candidate.difficulty) &&
          isValidLeaderboardEntry(candidate as LeaderboardEntry) &&
          (candidate.status === undefined || candidate.status === "offchain" || candidate.status === "onchain") &&
          (candidate.txHash === undefined || typeof candidate.txHash === "string")
        );
      }),
    );
  } catch {
    return [];
  }
};

const writeFallbackLeaderboard = (entries: LeaderboardEntry[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // The file-backed API is the source of truth; localStorage is only a best-effort fallback.
  }
};

const fetchApiLeaderboard = async () => {
  const response = await fetch("/api/scores", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Unable to load scores");
  }

  const scores = await response.json();

  if (!Array.isArray(scores)) {
    return [];
  }

  return normalizeLeaderboardEntries((scores as LeaderboardEntry[]).filter(isValidLeaderboardEntry));
};

const fetchApiHistory = async () => {
  const response = await fetch("/api/scores?view=history", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Unable to load score history");
  }

  const scores = await response.json();

  if (!Array.isArray(scores)) {
    return [];
  }

  return normalizeHistoryEntries((scores as LeaderboardEntry[]).filter(isValidLeaderboardEntry));
};

const getDifficultyConfig = (difficulty: Difficulty) => {
  return difficulties.find((item) => item.label === difficulty) ?? difficulties[1];
};

const getNeighborIndexes = (index: number, size: number) => {
  const row = Math.floor(index / size);
  const col = index % size;
  const neighbors: number[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) {
        continue;
      }

      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;

      if (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size) {
        neighbors.push(nextRow * size + nextCol);
      }
    }
  }

  return neighbors;
};

const createEmptyBoard = (difficulty: Difficulty): Cell[] => {
  const { size } = getDifficultyConfig(difficulty);
  const totalCells = size * size;

  return Array.from({ length: totalCells }, (_, index) => ({
    id: index,
    hasBee: false,
    revealed: false,
    adjacentBees: 0,
  }));
};

const createSeededBoard = (difficulty: Difficulty, safeCellIndex?: number): Cell[] => {
  const { size, bees } = getDifficultyConfig(difficulty);
  const totalCells = size * size;
  const beeIndexes = new Set<number>();

  while (beeIndexes.size < bees) {
    const nextBeeIndex = Math.floor(Math.random() * totalCells);

    if (nextBeeIndex !== safeCellIndex) {
      beeIndexes.add(nextBeeIndex);
    }
  }

  return Array.from({ length: totalCells }, (_, index) => {
    const hasBee = beeIndexes.has(index);
    const adjacentBees = getNeighborIndexes(index, size).filter((neighbor) => beeIndexes.has(neighbor)).length;

    return {
      id: index,
      hasBee,
      revealed: false,
      adjacentBees,
    };
  });
};

const recalculateAdjacentBeeCounts = (cells: Cell[], size: number) => {
  const beeIndexes = new Set(cells.filter((cell) => cell.hasBee).map((cell) => cell.id));

  return cells.map((cell) => ({
    ...cell,
    adjacentBees: getNeighborIndexes(cell.id, size).filter((neighbor) => beeIndexes.has(neighbor)).length,
  }));
};

export default function Home() {
  const { address: connectedAddress, chainId, isConnected } = useConnection();
  const { connectors, connectAsync, isPending: isConnectPending } = useConnect();
  const { switchChainAsync, isPending: isSwitchPending } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [screen, setScreen] = useState<Screen>("start");
  const [elapsed, setElapsed] = useState(0);
  const [board, setBoard] = useState<Cell[]>(() => createEmptyBoard("Medium"));
  const [status, setStatus] = useState<GameStatus>("playing");
  const [hasMadeFirstMove, setHasMadeFirstMove] = useState(false);
  const hasMadeFirstMoveRef = useRef(false);
  const endGameHistoryCheckedRef = useRef(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardEntry[]>([]);
  const [historyRows, setHistoryRows] = useState<LeaderboardEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [scoreSaveMessage, setScoreSaveMessage] = useState("");
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>("idle");
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [scoreTransactionHash, setScoreTransactionHash] = useState<Hex | undefined>();
  const [lastTransactionHash, setLastTransactionHash] = useState<Hex | undefined>();
  const [pendingScoreEntry, setPendingScoreEntry] = useState<LeaderboardEntry | null>(null);
  const [currentGameEntry, setCurrentGameEntry] = useState<LeaderboardEntry | null>(null);
  const [isSavingScore, setIsSavingScore] = useState(false);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicObjectUrlRef = useRef<string | null>(null);
  const bgLoopMonitorIdRef = useRef<number | null>(null);
  const clickSoundRef = useRef<HTMLAudioElement | null>(null);
  const stingSoundRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const scoreFeedbackTimerRef = useRef<number | null>(null);

  const selectedDifficulty = getDifficultyConfig(difficulty);
  const totalCells = selectedDifficulty.size * selectedDifficulty.size;
  const safeCellTotal = totalCells - selectedDifficulty.bees;
  const revealedSafeCells = useMemo(() => {
    return board.filter((cell) => cell.revealed && !cell.hasBee).length;
  }, [board]);
  const remainingSafeCells = safeCellTotal - revealedSafeCells;
  const score = revealedSafeCells * 10;
  const gameMessage = status === "stung" ? "\uD83D\uDC1D You got stung!" : status === "cleared" ? "\uD83C\uDF6F Hive cleared!" : "Find every safe cell";
  const isScoreTransactionPending = Boolean(scoreTransactionHash) && !scoreSubmitted;
  const isScoreSubmitting =
    submissionPhase === "confirming" ||
    submissionPhase === "pending" ||
    submissionPhase === "saving" ||
    isSwitchPending ||
    isWritePending ||
    isScoreTransactionPending ||
    isSavingScore;
  const gameResetLocked = isScoreSubmitting;
  const { isSuccess: scoreTransactionConfirmed, isError: scoreTransactionFailed } = useWaitForTransactionReceipt({
    chainId: targetChain.id,
    hash: scoreTransactionHash,
    query: {
      enabled: Boolean(scoreTransactionHash),
    },
  });

  useEffect(() => {
    const clickSound = new Audio("/audio/click.mp3");
    clickSound.volume = 0.3;
    clickSound.preload = "auto";

    const stingSound = new Audio("/audio/sting.mp3");
    stingSound.volume = 0.39;
    stingSound.preload = "auto";

    const winSound = new Audio("/audio/win.mp3");
    winSound.volume = 0.39;
    winSound.preload = "auto";

    clickSoundRef.current = clickSound;
    stingSoundRef.current = stingSound;
    winSoundRef.current = winSound;

    return () => {
      if (bgLoopMonitorIdRef.current !== null) {
        window.cancelAnimationFrame(bgLoopMonitorIdRef.current);
        bgLoopMonitorIdRef.current = null;
      }

      if (bgMusicObjectUrlRef.current) {
        URL.revokeObjectURL(bgMusicObjectUrlRef.current);
        bgMusicObjectUrlRef.current = null;
      }

      [bgMusicRef.current, clickSound, stingSound, winSound].forEach((audio) => {
        if (!audio) {
          return;
        }

        audio.pause();
      });
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    const loadScores = async () => {
      try {
        const scores = await fetchApiLeaderboard();

        if (isCurrent) {
          setLeaderboardRows(scores);
        }
      } catch {
        if (isCurrent) {
          setLeaderboardRows(readSavedLeaderboard());
        }
      }

      try {
        const history = await fetchApiHistory();

        if (isCurrent) {
          setHistoryRows(history);
        }
      } catch {
        if (isCurrent) {
          setHistoryRows(readSavedHistory());
        }
      }
    };

    void loadScores();

    return () => {
      isCurrent = false;

      if (scoreFeedbackTimerRef.current !== null) {
        window.clearTimeout(scoreFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!leaderboardOpen) {
      return;
    }

    let isCurrent = true;

    const loadScores = async () => {
      try {
        const scores = await fetchApiLeaderboard();

        if (isCurrent) {
          setLeaderboardRows(scores);
        }
      } catch {
        if (isCurrent) {
          setLeaderboardRows(readSavedLeaderboard());
        }
      }
    };

    void loadScores();

    return () => {
      isCurrent = false;
    };
  }, [leaderboardOpen]);

  useEffect(() => {
    if (!historyOpen) {
      return;
    }

    let isCurrent = true;

    const loadHistory = async () => {
      try {
        const history = await fetchApiHistory();

        if (isCurrent) {
          setHistoryRows(history);
          setHistoryPage(0);
        }
      } catch {
        if (isCurrent) {
          setHistoryRows(readSavedHistory());
          setHistoryPage(0);
        }
      }
    };

    void loadHistory();

    return () => {
      isCurrent = false;
    };
  }, [historyOpen]);

  useEffect(() => {
    if (screen !== "game" || status !== "playing") {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsed((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [screen, status]);

  useEffect(() => {
    if (screen === "game") {
      return;
    }

    bgMusicRef.current?.pause();
  }, [screen]);

  const stopBackgroundLoopMonitor = () => {
    if (bgLoopMonitorIdRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(bgLoopMonitorIdRef.current);
    bgLoopMonitorIdRef.current = null;
  };

  const restartBackgroundLoop = () => {
    const bgMusic = bgMusicRef.current;

    if (!bgMusic) {
      return;
    }

    bgMusic.currentTime = 0;

    if (!bgMusic.paused) {
      void bgMusic.play().catch(() => undefined);
    }
  };

  const monitorBackgroundLoop = () => {
    const bgMusic = bgMusicRef.current;

    if (bgMusic && !bgMusic.paused && Number.isFinite(bgMusic.duration) && bgMusic.duration > 0) {
      const remaining = bgMusic.duration - bgMusic.currentTime;

      if (remaining <= BG_LOOP_LEAD_TIME) {
        restartBackgroundLoop();
      }
    }

    bgLoopMonitorIdRef.current = window.requestAnimationFrame(monitorBackgroundLoop);
  };

  const startBackgroundLoopMonitor = () => {
    if (bgLoopMonitorIdRef.current !== null) {
      return;
    }

    bgLoopMonitorIdRef.current = window.requestAnimationFrame(monitorBackgroundLoop);
  };

  const getBackgroundMusic = async () => {
    if (bgMusicRef.current) {
      return bgMusicRef.current;
    }

    const bgMusic = new Audio();
    const supportsOgg = bgMusic.canPlayType('audio/ogg; codecs="vorbis"') !== "";
    const sourceUrl = supportsOgg ? "/audio/bg-loop.ogg" : "/audio/bg-loop.mp3";
    const response = await fetch(sourceUrl, { cache: "force-cache" });

    if (!response.ok) {
      throw new Error("Unable to load background music");
    }

    const objectUrl = URL.createObjectURL(await response.blob());

    bgMusic.preload = "none";
    bgMusic.loop = false;
    bgMusic.volume = BG_MUSIC_VOLUME;
    bgMusic.src = objectUrl;
    bgMusic.onplay = startBackgroundLoopMonitor;
    bgMusic.onpause = stopBackgroundLoopMonitor;
    bgMusic.onended = restartBackgroundLoop;

    bgMusicObjectUrlRef.current = objectUrl;
    bgMusicRef.current = bgMusic;

    return bgMusic;
  };

  const playBackgroundMusic = async () => {
    const bgMusic = await getBackgroundMusic().catch(() => null);

    if (!bgMusic) {
      return;
    }

    bgMusic.volume = BG_MUSIC_VOLUME;
    await bgMusic.play().catch(() => undefined);
  };

  const playSoundEffect = (audio: HTMLAudioElement | null) => {
    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  };

  const resetScoreSubmission = () => {
    setScoreSaveMessage("");
    setSubmissionPhase("idle");
    setScoreSubmitted(false);
    setScoreTransactionHash(undefined);
    setPendingScoreEntry(null);
    setCurrentGameEntry(null);
    setIsSavingScore(false);

    if (scoreFeedbackTimerRef.current !== null) {
      window.clearTimeout(scoreFeedbackTimerRef.current);
      scoreFeedbackTimerRef.current = null;
    }
  };

  const saveScoreLocally = async (entry: LeaderboardEntry) => {
    if (!isValidLeaderboardEntry(entry)) {
      return false;
    }

    const upsertEntry = (entries: LeaderboardEntry[]) => {
      const existingIndex = entries.findIndex((item) => item.id === entry.id);

      return existingIndex >= 0
        ? entries.map((item, index) => (index === existingIndex ? { ...item, ...entry } : item))
        : [entry, ...entries];
    };
    const nextHistory = normalizeHistoryEntries(upsertEntry(historyRows));

    try {
      const response = await fetch("/api/scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entry),
      });

      if (!response.ok) {
        throw new Error("Unable to save score");
      }

      const savedRows = await response.json();
      const nextRows = Array.isArray(savedRows) ? normalizeLeaderboardEntries(savedRows as LeaderboardEntry[]) : normalizeLeaderboardEntries(upsertEntry(leaderboardRows));
      setLeaderboardRows(nextRows);
      setHistoryRows(nextHistory);
      writeFallbackLeaderboard(nextHistory);
      return true;
    } catch {
      const nextRows = normalizeLeaderboardEntries(upsertEntry(leaderboardRows));
      setLeaderboardRows(nextRows);
      setHistoryRows(nextHistory);
      writeFallbackLeaderboard(nextHistory);
      return true;
    }
  };

  useEffect(() => {
    if (!scoreTransactionConfirmed || !pendingScoreEntry || scoreSubmitted) {
      return;
    }

    let isCurrent = true;

    const finalizeScoreSubmission = async () => {
      setIsSavingScore(true);
      setSubmissionPhase("saving");
      const saved = await saveScoreLocally(pendingScoreEntry);

      if (!isCurrent) {
        return;
      }

      if (!saved) {
        setSubmissionPhase("idle");
        setScoreSaveMessage("Invalid score");
        setIsSavingScore(false);
        return;
      }

      setScoreSubmitted(true);
      setSubmissionPhase("success");
      setScoreSaveMessage("Score submitted successfully");
      setLastTransactionHash(pendingScoreEntry.txHash);
      setPendingScoreEntry(null);
      setIsSavingScore(false);
    };

    void finalizeScoreSubmission();

    return () => {
      isCurrent = false;
    };
  }, [pendingScoreEntry, scoreSubmitted, scoreTransactionConfirmed]);

  useEffect(() => {
    if (screen !== "game" || status === "playing" || endGameHistoryCheckedRef.current) {
      return;
    }

    endGameHistoryCheckedRef.current = true;

    if (!connectedAddress) {
      return;
    }

    const offchainEntry: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      player: connectedAddress,
      score,
      difficulty,
      elapsed,
      timestamp: Date.now(),
      status: "offchain",
    };

    if (!isValidLeaderboardEntry(offchainEntry)) {
      return;
    }

    setCurrentGameEntry(offchainEntry);
    void saveScoreLocally(offchainEntry);
  }, [connectedAddress, difficulty, elapsed, score, screen, status]);

  useEffect(() => {
    if (!scoreTransactionFailed || !pendingScoreEntry) {
      return;
    }

    setSubmissionPhase("idle");
    setScoreSaveMessage("Transaction failed");
    setScoreTransactionHash(undefined);
    setPendingScoreEntry(null);
    setIsSavingScore(false);
  }, [pendingScoreEntry, scoreTransactionFailed]);

  const startGame = () => {
    if (gameResetLocked) {
      return;
    }

    setBoard(createEmptyBoard(difficulty));
    setElapsed(0);
    setStatus("playing");
    hasMadeFirstMoveRef.current = false;
    endGameHistoryCheckedRef.current = false;
    setHasMadeFirstMove(false);
    resetScoreSubmission();
    setScreen("game");
    if (musicEnabled) {
      void playBackgroundMusic();
    }
  };

  const restartGame = () => {
    if (gameResetLocked) {
      return;
    }

    setBoard(createEmptyBoard(difficulty));
    setElapsed(0);
    setStatus("playing");
    hasMadeFirstMoveRef.current = false;
    endGameHistoryCheckedRef.current = false;
    setHasMadeFirstMove(false);
    resetScoreSubmission();
  };

  const connectWalletForScore = async () => {
    if (isConnected || isConnectPending) {
      return;
    }

    const connector = connectors[0];

    if (!connector) {
      setScoreSaveMessage("No wallet connector found");
      return;
    }

    setScoreSaveMessage("Connect wallet to save your score");

    try {
      await connectAsync({ connector, chainId: targetChain.id });
      setScoreSaveMessage("");
    } catch {
      setScoreSaveMessage("Wallet connection cancelled");
    }
  };

  const submitScore = async () => {
    if (status === "playing" || isScoreSubmitting) {
      return;
    }

    if (!isConnected || !connectedAddress) {
      setScoreSaveMessage("Connect wallet to save your score");
      return;
    }

    if (scoreSubmitted || currentGameEntry?.status === "onchain" || currentGameEntry?.txHash) {
      setScoreSaveMessage("This game has already been submitted");
      return;
    }

    const validationEntry: LeaderboardEntry = {
      id: currentGameEntry?.id ?? "pending-validation",
      player: connectedAddress,
      score,
      difficulty,
      elapsed,
      timestamp: currentGameEntry?.timestamp ?? Date.now(),
      status: currentGameEntry?.status ?? "offchain",
    };

    if (!isValidLeaderboardEntry(validationEntry)) {
      setScoreSaveMessage("Invalid score");
      return;
    }

    setSubmissionPhase("confirming");
    setScoreSaveMessage("Confirm transaction in your wallet");

    try {
      let playerAddress = connectedAddress;

      if (!playerAddress) {
        setScoreSaveMessage("Wallet connected. Submit again.");
        return;
      }

      if (chainId !== targetChain.id) {
        setScoreSaveMessage("Switch to Base Sepolia");

        try {
          await switchChainAsync({ chainId: targetChain.id });
        } catch {
          setSubmissionPhase("idle");
          setScoreSaveMessage("Switch to Base Sepolia");
          return;
        }

        setScoreSaveMessage("Confirm transaction in your wallet");
      }

      const nextEntry: LeaderboardEntry = {
        id: currentGameEntry?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        player: playerAddress,
        score,
        difficulty,
        elapsed,
        timestamp: currentGameEntry?.timestamp ?? Date.now(),
        status: "onchain",
      };

      const hash = await writeContractAsync({
        address: beeSweeperScoresAddress,
        abi: beeSweeperScoresAbi,
        functionName: "submitScore",
        args: [BigInt(score), difficulty, BigInt(elapsed)],
        chainId: targetChain.id,
      });

      const onchainEntry = { ...nextEntry, txHash: hash, status: "onchain" as const };
      setCurrentGameEntry(onchainEntry);
      setPendingScoreEntry(onchainEntry);
      setScoreTransactionHash(hash);
      setSubmissionPhase("pending");
      setScoreSaveMessage("Waiting for Base Sepolia confirmation...");
    } catch (error) {
      setSubmissionPhase("idle");
      setScoreSaveMessage(getSubmissionErrorMessage(error));
      setPendingScoreEntry(null);
      setScoreTransactionHash(undefined);
      setIsSavingScore(false);
    }
  };

  const toggleMusic = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const nextMusicEnabled = !musicEnabled;
    const bgMusic = bgMusicRef.current;

    setMusicEnabled(nextMusicEnabled);

    if (!nextMusicEnabled || screen !== "game") {
      bgMusic?.pause();
      return;
    }

    void playBackgroundMusic();
  };

  const revealCell = (cellId: number) => {
    if (status !== "playing") {
      return;
    }

    let activeBoard = board;
    let target = activeBoard[cellId];

    if (!target || target.revealed) {
      return;
    }

    if (!hasMadeFirstMoveRef.current) {
      hasMadeFirstMoveRef.current = true;
      setHasMadeFirstMove(true);
      activeBoard = createSeededBoard(difficulty, cellId);
      target = activeBoard[cellId];
    }

    if (target.hasBee) {
      playSoundEffect(stingSoundRef.current);
      setBoard(activeBoard.map((cell) => (cell.id === cellId ? { ...cell, revealed: true } : cell)));
      setStatus("stung");
      return;
    }

    const nextRevealedSafeCells = revealedSafeCells + 1;

    playSoundEffect(clickSoundRef.current);
    setBoard(activeBoard.map((cell) => (cell.id === cellId ? { ...cell, revealed: true } : cell)));

    if (nextRevealedSafeCells === safeCellTotal) {
      playSoundEffect(winSoundRef.current);
      setStatus("cleared");
    }
  };

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#07121F] px-5 py-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,82,255,0.34),transparent_35%),linear-gradient(180deg,#0A1A36_0%,#07121F_60%,#050B13_100%)]" />
      <div className="absolute -right-20 top-10 h-56 w-56 rounded-full bg-[#F8C342]/25 blur-3xl" />
      <div className="absolute -left-24 bottom-12 h-64 w-64 rounded-full bg-[#0052FF]/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(30deg,#fff_12%,transparent_12.5%,transparent_87%,#fff_87.5%,#fff),linear-gradient(150deg,#fff_12%,transparent_12.5%,transparent_87%,#fff_87.5%,#fff),linear-gradient(30deg,#fff_12%,transparent_12.5%,transparent_87%,#fff_87.5%,#fff),linear-gradient(150deg,#fff_12%,transparent_12.5%,transparent_87%,#fff_87.5%,#fff)] [background-position:0_0,0_0,22px_39px,22px_39px] [background-size:44px_78px]" />

      {leaderboardOpen && screen === "start" ? (
        <LeaderboardSheet rows={leaderboardRows} onClose={() => setLeaderboardOpen(false)} />
      ) : null}

      {historyOpen && screen === "game" ? (
        <HistorySheet
          connectedAddress={connectedAddress}
          page={historyPage}
          rows={historyRows}
          setPage={setHistoryPage}
          onConnectWallet={connectWalletForScore}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {screen === "start" ? (
        <section className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setLeaderboardOpen(true)}
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur transition hover:border-[#F8C342]/35 hover:bg-[#F8C342]/10 hover:text-[#F8C342] focus:outline-none focus:ring-4 focus:ring-[#F8C342]/25"
              aria-label="Open leaderboard preview"
            >
              <Trophy className="h-4 w-4 text-[#F8C342]" aria-hidden="true" />
              Leaders
            </button>
            <WalletButton />
          </div>

          <div className="flex flex-col items-center pt-14 text-center">
            <BeeMark size="large" />

            <p className="mb-3 text-sm font-black uppercase tracking-normal text-[#F8C342]">
              BASE SEPOLIA ARCADE
            </p>
            <h1 className="text-5xl font-black leading-none tracking-normal text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.35)]">
              BeeSweeper
            </h1>
            <p className="mt-5 max-w-xs text-balance text-lg font-semibold leading-7 text-white/80">
              Clear the hive. Avoid the bees.
            </p>
          </div>

          <div className="mt-12 space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.08] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <DifficultySelector difficulty={difficulty} setDifficulty={setDifficulty} />

            <button
              type="button"
              onClick={startGame}
              className="group flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#0052FF] px-6 text-base font-black uppercase tracking-[0.14em] text-white shadow-[0_18px_36px_rgba(0,82,255,0.36)] transition hover:-translate-y-0.5 hover:bg-[#0A63FF] focus:outline-none focus:ring-4 focus:ring-[#F8C342]/45"
            >
              <Play className="h-5 w-5 fill-white transition group-hover:translate-x-0.5" aria-hidden="true" />
              Start Game
            </button>
          </div>

          <Footer />
        </section>
      ) : (
        <section className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.08] p-2.5 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!gameResetLocked) {
                    setScreen("start");
                  }
                }}
                disabled={gameResetLocked}
                aria-label="Back to start screen"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 focus:outline-none focus:ring-4 focus:ring-[#F8C342]/35"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="flex min-w-0 items-center gap-2 text-center">
                <BeeMark size="small" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#F8C342]">
                    BeeSweeper
                  </p>
                  <h1 className="truncate text-xl font-black leading-6 text-white">Hive Run</h1>
                </div>
              </div>

              <button
                type="button"
                onClick={restartGame}
                disabled={gameResetLocked}
                aria-label="Restart game"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 focus:outline-none focus:ring-4 focus:ring-[#F8C342]/35"
              >
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1.5 rounded-2xl border border-white/10 bg-[#07121F]/55 p-1.5 shadow-xl shadow-black/15">
              <CompactStat label="Score" value={score.toString()} />
              <CompactStat label="Time" value={formatTime(elapsed)} />
              <CompactStat label="Level" value={difficulty} accent />
              <CompactStat label="Safe" value={remainingSafeCells.toString()} />
            </div>

            <div
              className={`mt-2 rounded-2xl border px-3 py-2 text-center text-xs font-black shadow-xl transition ${
                status === "cleared"
                  ? "border-[#F8C342]/45 bg-[#F8C342]/20 text-[#F8C342]"
                  : status === "stung"
                    ? "border-white/20 bg-white/15 text-white"
                    : "border-[#0052FF]/45 bg-[#0052FF]/20 text-white/80"
              }`}
              aria-live="polite"
            >
              {gameMessage}
            </div>

            <div className="mt-2 mx-auto w-full max-w-[430px] rounded-[1.35rem] border border-white/10 bg-[#06101D]/80 p-2 shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
              <div
                className="grid aspect-square w-full gap-1"
                style={{ gridTemplateColumns: `repeat(${selectedDifficulty.size}, minmax(0, 1fr))` }}
              >
                {board.map((cell) => (
                  <CellButton
                    key={cell.id}
                    cell={cell}
                    disabled={status !== "playing" || cell.revealed}
                    onReveal={() => revealCell(cell.id)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-1.5 grid grid-cols-3 items-center gap-2">
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-white/50 transition hover:border-[#F8C342]/35 hover:bg-[#F8C342]/10 hover:text-[#F8C342] focus:outline-none focus:ring-2 focus:ring-[#F8C342]/25"
                >
                  <History className="h-3 w-3" aria-hidden="true" />
                  History
                </button>
              </div>
              <div aria-hidden="true" />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={toggleMusic}
                  aria-pressed={musicEnabled}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/50 transition hover:border-[#F8C342]/35 hover:bg-[#F8C342]/10 hover:text-[#F8C342] focus:outline-none focus:ring-2 focus:ring-[#F8C342]/25"
                >
                  {musicEnabled ? <Volume2 className="h-3 w-3" aria-hidden="true" /> : <VolumeX className="h-3 w-3" aria-hidden="true" />}
                  <span>Music</span>
                  <span className="text-white/30">{musicEnabled ? "On" : "Off"}</span>
                </button>
              </div>
            </div>

            {status !== "playing" ? (
              <div className="absolute inset-x-2 bottom-2 z-20">
                <ResultCard
                  difficulty={difficulty}
                  elapsed={elapsed}
                  isSubmitting={isScoreSubmitting}
                  isWalletConnected={isConnected}
                  saveMessage={scoreSaveMessage}
                  score={score}
                  scoreSubmitted={scoreSubmitted}
                  submissionPhase={submissionPhase}
                  status={status}
                  transactionHash={lastTransactionHash}
                  onConnectWallet={connectWalletForScore}
                  onPlayAgain={restartGame}
                  onSubmitScore={submitScore}
                />
              </div>
            ) : null}
          </div>

          <Footer />
        </section>
      )}
    </main>
  );
}

function WalletButton() {
  const { address, chainId, isConnected, isConnecting } = useConnection();
  const { connectors, connect, isPending: isConnectPending } = useConnect();
  const { disconnect, isPending: isDisconnectPending } = useDisconnect();
  const { switchChain, isPending: isSwitchPending } = useSwitchChain();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isWrongNetwork = isConnected && chainId !== targetChain.id;
  const isBusy = isConnecting || isConnectPending || isDisconnectPending || isSwitchPending;
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  const label = isWrongNetwork
    ? "Switch Network"
    : isConnected
      ? `${shortAddress} connected`
      : isBusy
        ? "Connecting..."
        : "Connect Wallet";

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setCopied(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);

    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  const handleWalletClick = () => {
    if (isBusy) {
      return;
    }

    if (isWrongNetwork) {
      setMenuOpen(false);
      setCopied(false);
      switchChain({ chainId: targetChain.id });
      return;
    }

    if (isConnected) {
      setMenuOpen((open) => !open);
      return;
    }

    const connector = connectors[0];

    if (connector) {
      connect({ connector, chainId: targetChain.id });
    }
  };

  const copyAddress = async () => {
    if (!address) {
      return;
    }

    await navigator.clipboard?.writeText(address).catch(() => undefined);
    setCopied(true);

    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }

    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      setMenuOpen(false);
      copyFeedbackTimerRef.current = null;
    }, 800);
  };

  const disconnectWallet = () => {
    disconnect();
    setCopied(false);
    setMenuOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={handleWalletClick}
        disabled={isBusy}
        className={`flex h-9 max-w-[9.75rem] items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-black transition disabled:cursor-wait disabled:opacity-70 focus:outline-none focus:ring-4 focus:ring-[#F8C342]/20 ${
          isWrongNetwork
            ? "border-[#F8C342]/30 bg-[#F8C342]/10 text-[#F8C342]/85 hover:bg-[#F8C342]/15"
            : isConnected
              ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100/80 hover:bg-emerald-300/[0.12]"
              : "border-white/12 bg-white/[0.055] text-white/58 hover:border-[#0052FF]/30 hover:bg-[#0052FF]/10 hover:text-white/78"
        }`}
        aria-expanded={isConnected && !isWrongNetwork ? menuOpen : undefined}
        aria-haspopup={isConnected && !isWrongNetwork ? "menu" : undefined}
        aria-label={isWrongNetwork ? `Switch to ${targetChain.name}` : isConnected ? `Wallet menu for ${shortAddress}` : "Connect wallet"}
        title={isConnected && !isWrongNetwork ? "Wallet options" : undefined}
      >
        <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>

      {menuOpen && isConnected && !isWrongNetwork ? (
        <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-white/10 bg-[#07121F]/95 p-2 shadow-2xl shadow-black/35 backdrop-blur-xl">
          <button
            type="button"
            onClick={copyAddress}
            className="flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-left text-xs font-black text-white/70 transition hover:-translate-y-px hover:bg-[#F8C342]/10 hover:text-[#F8C342] focus:outline-none focus:ring-2 focus:ring-[#F8C342]/25"
            role="menuitem"
          >
            <span className="whitespace-nowrap">Copy Address</span>
            <span
              className={`shrink-0 rounded-full border border-[#F8C342]/20 bg-[#F8C342]/15 px-2 py-0.5 text-[10px] text-[#F8C342] transition-all duration-200 ease-out ${
                copied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`}
            >
              Copied!
            </span>
          </button>
          <button
            type="button"
            onClick={disconnectWallet}
            className="mt-1 flex w-full items-center justify-start whitespace-nowrap rounded-xl px-3.5 py-2.5 text-left text-xs font-black text-white/58 transition hover:-translate-y-px hover:bg-white/[0.07] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#F8C342]/25"
            role="menuitem"
          >
            Disconnect Wallet
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LeaderboardSheet({ rows, onClose }: { rows: LeaderboardEntry[]; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#050B13]/55 px-4 py-5 backdrop-blur-sm">
      <div className="w-full max-w-md translate-y-0 rounded-[1.6rem] border border-white/10 bg-[#07121F]/95 p-5 shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#F8C342]">Leaderboard</p>
            <h2 className="mt-0.5 text-xl font-black leading-none text-white">Top Hive Clears</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-lg font-black text-white/65 transition hover:bg-white/[0.1] hover:text-white focus:outline-none focus:ring-4 focus:ring-[#F8C342]/25"
            aria-label="Close leaderboard preview"
          >
            x
          </button>
        </div>

        <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-1">
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <div
                key={row.id}
                className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-2.5 py-1.5"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F8C342]/15 font-mono text-xs font-black text-[#F8C342]">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-black text-white">{shortPlayerName(row.player)}</p>
                  <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.13em] text-white/38">
                    {row.difficulty} / {formatTime(row.elapsed)}
                  </p>
                </div>
                <p className="font-mono text-xs font-black text-white">{row.score.toLocaleString()}</p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.055] px-4 py-5 text-center">
              <p className="text-sm font-black text-white">No saved scores yet</p>
              <p className="mt-1 text-xs font-semibold text-white/45">Clear a hive, submit the result, and it will show up here.</p>
            </div>
          )}
        </div>

        <p className="mt-2.5 text-center text-[11px] font-semibold text-white/45">
          Scores are stored locally for now. Base Sepolia saving is coming later.
        </p>
      </div>
    </div>
  );
}

function HistorySheet({
  connectedAddress,
  page,
  rows,
  setPage,
  onConnectWallet,
  onClose,
}: {
  connectedAddress?: string;
  page: number;
  rows: LeaderboardEntry[];
  setPage: (page: number) => void;
  onConnectWallet: () => void;
  onClose: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const walletRows = filterHistoryForWallet(rows, connectedAddress);
  const totalPages = Math.max(1, Math.ceil(walletRows.length / HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleRows = walletRows.slice(safePage * HISTORY_PAGE_SIZE, safePage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE);
  const copyValue = async (key: string, value: string) => {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => (current === key ? "" : current)), 900);
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-[#050B13]/55 px-4 pb-5 backdrop-blur-sm sm:items-center sm:pb-0">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#07121F]/95 p-4 shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="relative">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#F8C342]">History</p>
              <button
                type="button"
                onClick={() => setHelpOpen((open) => !open)}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/45 transition hover:border-[#F8C342]/30 hover:text-[#F8C342] focus:outline-none focus:ring-2 focus:ring-[#F8C342]/25"
                aria-label="Explain onchain and offchain scores"
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <h2 className="mt-1 text-2xl font-black leading-none text-white">Submitted Games</h2>
            {helpOpen ? (
              <div className="absolute left-0 top-14 z-10 w-72 rounded-2xl border border-white/10 bg-[#07121F] p-3 text-xs font-semibold leading-5 text-white/62 shadow-2xl shadow-black/45">
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  className="float-right ml-2 text-sm font-black text-white/45 transition hover:text-white"
                  aria-label="Dismiss history help"
                >
                  x
                </button>
                Onchain scores are submitted to Base Sepolia and can be verified on Basescan. Offchain scores are saved locally and are not yet onchain.
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xl font-black text-white/65 transition hover:bg-white/[0.1] hover:text-white focus:outline-none focus:ring-4 focus:ring-[#F8C342]/25"
            aria-label="Close game history"
          >
            x
          </button>
        </div>

        {!connectedAddress ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-7 text-center">
            <p className="text-sm font-black text-white">Connect wallet to view your game history</p>
            <button
              type="button"
              onClick={onConnectWallet}
              className="mt-3 text-xs font-black text-[#F8C342] underline decoration-[#F8C342]/45 underline-offset-4 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-[#F8C342]/25"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {visibleRows.length > 0 ? (
              visibleRows.map((row) => {
                const hasProof = Boolean(row.txHash);
                const walletCopyKey = `${row.id}-wallet`;
                const txCopyKey = `${row.id}-tx`;

                return (
                  <div
                    key={row.id}
                    className={`rounded-2xl border px-3 py-2.5 ${
                      hasProof ? "border-[#F8C342]/20 bg-[#F8C342]/10" : "border-white/10 bg-white/[0.055]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-base font-black text-white">{row.score.toLocaleString()}</p>
                        <span className="rounded-full bg-[#F8C342]/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#F8C342]">{row.difficulty}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${hasProof ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100/70" : "border-white/10 bg-white/[0.05] text-white/35"}`}>
                          {hasProof ? "Onchain" : "Offchain"}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
                        {formatTime(row.elapsed)} / {formatHistoryDate(row.timestamp)}
                      </p>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => copyValue(walletCopyKey, row.player)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[10px] font-black text-white/55 transition hover:border-[#F8C342]/30 hover:text-[#F8C342] focus:outline-none focus:ring-2 focus:ring-[#F8C342]/25"
                        aria-label="Copy wallet address"
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        {copiedKey === walletCopyKey ? "Copied!" : shortPlayerName(row.player)}
                      </button>

                      {hasProof && row.txHash ? (
                        <button
                          type="button"
                          onClick={() => copyValue(txCopyKey, row.txHash ?? "")}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[10px] font-black text-white/55 transition hover:border-[#F8C342]/30 hover:text-[#F8C342] focus:outline-none focus:ring-2 focus:ring-[#F8C342]/25"
                          aria-label="Copy transaction hash"
                        >
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          {copiedKey === txCopyKey ? "Copied!" : shortHash(row.txHash)}
                        </button>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/28">Not submitted onchain</span>
                      )}
                    </div>

                    {hasProof && row.txHash ? (
                      <a
                        href={getBasescanTxUrl(row.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-xl border border-[#F8C342]/25 bg-[#F8C342]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-[#F8C342] transition hover:bg-[#F8C342]/15 focus:outline-none focus:ring-4 focus:ring-[#F8C342]/25"
                      >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          View on Basescan
                      </a>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-6 text-center">
                <p className="text-sm font-black text-white">No submitted games yet</p>
                <p className="mt-1 text-xs font-semibold text-white/45">Submitted scores will appear here with proof links when available.</p>
              </div>
            )}
          </div>
        )}

        {connectedAddress ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="h-9 rounded-full border border-white/10 bg-white/[0.055] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/55 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-35 focus:outline-none focus:ring-4 focus:ring-[#F8C342]/25"
            >
              Prev
            </button>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/38">
              Page {safePage + 1} / {totalPages}
            </p>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="h-9 rounded-full border border-white/10 bg-white/[0.055] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/55 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-35 focus:outline-none focus:ring-4 focus:ring-[#F8C342]/25"
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CellButton({
  cell,
  disabled,
  onReveal,
}: {
  cell: Cell;
  disabled: boolean;
  onReveal: () => void;
}) {
  const revealedSafe = cell.revealed && !cell.hasBee;
  const revealedBee = cell.revealed && cell.hasBee;
  const numberColor = adjacentTextColor[cell.adjacentBees] ?? "text-[#07121F]";

  return (
    <button
      type="button"
      aria-label={cell.revealed ? (cell.hasBee ? "Revealed bee" : `Safe cell with ${cell.adjacentBees} adjacent bees`) : `Hidden cell ${cell.id + 1}`}
      disabled={disabled}
      onClick={onReveal}
      className={`group relative aspect-square overflow-hidden rounded-md border text-center transition duration-150 focus:outline-none focus:ring-2 focus:ring-[#F8C342]/80 ${
        revealedBee
          ? "border-[#F8C342] bg-[#F8C342] shadow-[0_0_18px_rgba(248,195,66,0.35)]"
          : revealedSafe
            ? "border-[#F8C342]/25 bg-white shadow-[inset_0_2px_5px_rgba(7,18,31,0.14)]"
            : "border-white/10 bg-[#12345A] shadow-[inset_0_-3px_0_rgba(0,0,0,0.2),0_4px_10px_rgba(0,0,0,0.16)] hover:-translate-y-0.5 hover:bg-[#0052FF] active:translate-y-0 active:scale-95"
      }`}
    >
      {!cell.revealed ? (
        <>
          <span className="absolute inset-x-1 top-1 h-1 rounded-full bg-white/20 transition group-hover:bg-white/30" />
          <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-[#F8C342]/45 transition group-hover:scale-125 group-hover:bg-[#F8C342]" />
        </>
      ) : revealedBee ? (
        <BeeCell />
      ) : cell.adjacentBees > 0 ? (
        <span className={`flex h-full w-full items-center justify-center font-mono text-[clamp(0.7rem,3vw,1.1rem)] font-black ${numberColor}`}>
          {cell.adjacentBees}
        </span>
      ) : (
        <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-[#F8C342]/35" />
      )}
    </button>
  );
}

function BeeCell() {
  return (
    <span
      className="absolute inset-0 flex items-center justify-center text-[clamp(1rem,4.5vw,1.6rem)] drop-shadow-[0_2px_0_rgba(7,18,31,0.28)]"
      role="img"
      aria-label="Bee"
    >
      {"\uD83D\uDC1D"}
    </span>
  );
}

function ResultCard({
  difficulty,
  elapsed,
  isSubmitting,
  isWalletConnected,
  saveMessage,
  score,
  scoreSubmitted,
  submissionPhase,
  status,
  transactionHash,
  onConnectWallet,
  onPlayAgain,
  onSubmitScore,
}: {
  difficulty: Difficulty;
  elapsed: number;
  isSubmitting: boolean;
  isWalletConnected: boolean;
  saveMessage: string;
  score: number;
  scoreSubmitted: boolean;
  submissionPhase: SubmissionPhase;
  status: Exclude<GameStatus, "playing">;
  transactionHash?: Hex;
  onConnectWallet: () => void;
  onPlayAgain: () => void;
  onSubmitScore: () => void;
}) {
  const submitDisabled = !isWalletConnected || scoreSubmitted || isSubmitting;
  const isSuccessMessage = submissionPhase === "success" && Boolean(transactionHash);

  return (
    <div className="rounded-3xl border border-white/10 bg-[#07121F]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/45">Result</p>
          <h2 className="mt-1 text-xl font-black text-white">
            {status === "cleared" ? "Hive cleared!" : "Stung!"}
          </h2>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F8C342] text-2xl shadow-[0_10px_24px_rgba(248,195,66,0.28)]">
          {status === "cleared" ? "\uD83C\uDF6F" : "\uD83D\uDC1D"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ResultMetric label="Final Score" value={score.toString()} />
        <ResultMetric label="Time" value={formatTime(elapsed)} />
        <ResultMetric label="Difficulty" value={difficulty} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onPlayAgain}
          disabled={isSubmitting}
          className="flex h-12 items-center justify-center rounded-2xl bg-[#0052FF] px-4 text-sm font-black text-white shadow-[0_12px_26px_rgba(0,82,255,0.28)] transition hover:-translate-y-0.5 hover:bg-[#0A63FF] disabled:cursor-not-allowed disabled:bg-white/[0.055] disabled:text-white/35 disabled:shadow-none focus:outline-none focus:ring-4 focus:ring-[#F8C342]/40"
        >
          Play Again
        </button>
        <button
          type="button"
          onClick={onSubmitScore}
          disabled={submitDisabled}
          className="flex h-12 items-center justify-center rounded-2xl border border-[#F8C342]/35 bg-[#F8C342]/15 px-4 text-sm font-black text-[#F8C342] transition hover:bg-[#F8C342]/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.055] disabled:text-white/35 focus:outline-none focus:ring-4 focus:ring-[#F8C342]/30"
        >
          {isWalletConnected && isSubmitting ? "Submitting..." : scoreSubmitted ? "Submitted" : "Submit Score"}
        </button>
      </div>

      {saveMessage ? (
        <div
          className={`mt-3 rounded-2xl border px-3 py-2 text-center text-xs font-black transition ${
            isSuccessMessage
                ? "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100/85 shadow-[0_0_22px_rgba(16,185,129,0.12)] animate-pulse"
                : "border-[#F8C342]/30 bg-[#F8C342]/12 text-[#F8C342]"
          }`}
          aria-live="polite"
        >
          <p>{saveMessage}</p>
          {isSuccessMessage && transactionHash ? (
            <a
              href={getBasescanTxUrl(transactionHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-[#F8C342]/25 bg-[#F8C342]/10 px-3 py-1.5 text-[10px] font-black text-[#F8C342] transition hover:bg-[#F8C342]/15 focus:outline-none focus:ring-4 focus:ring-[#F8C342]/25"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              View on Basescan
            </a>
          ) : null}
        </div>
      ) : null}

      {!isWalletConnected ? (
        <p className="mt-3 text-center text-xs font-semibold text-white/48">
          Connect wallet to save your score{" "}
          <button
            type="button"
            onClick={onConnectWallet}
            className="font-black text-[#F8C342] underline decoration-[#F8C342]/45 underline-offset-4 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-[#F8C342]/25"
          >
            Connect Wallet?
          </button>
        </p>
      ) : null}

    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#07121F]/70 p-3 text-center">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-black text-white">{value}</p>
    </div>
  );
}

function BeeMark({ size }: { size: "small" | "large" }) {
  const dimensions = size === "large" ? "mb-7 h-28 w-28" : "h-12 w-12";
  const hexSize = size === "large" ? "h-16 w-16" : "h-7 w-7";
  const eyeSize = size === "large" ? "h-3 w-3" : "h-1.5 w-1.5";
  const eyePosition = size === "large" ? "top-11" : "top-[19px]";
  const mouth = size === "large" ? "bottom-8 h-1.5 w-8" : "bottom-[13px] h-1 w-4";

  return (
    <div className={`relative flex items-center justify-center ${dimensions}`}>
      <div className="absolute inset-0 rotate-6 rounded-[2rem] bg-[#F8C342] shadow-[0_18px_55px_rgba(248,195,66,0.28)]" />
      <div className="absolute inset-[12%] rounded-[1.55rem] border-4 border-[#07121F] bg-white" />
      <Hexagon className={`relative fill-[#F8C342] text-[#07121F] ${hexSize}`} strokeWidth={2.8} aria-hidden="true" />
      <div className={`absolute left-[25%] ${eyePosition} ${eyeSize} rounded-full bg-[#07121F]`} />
      <div className={`absolute right-[25%] ${eyePosition} ${eyeSize} rounded-full bg-[#07121F]`} />
      <div className={`absolute ${mouth} rounded-full bg-[#0052FF]`} />
    </div>
  );
}

function DifficultySelector({
  difficulty,
  setDifficulty,
}: {
  difficulty: Difficulty;
  setDifficulty: (difficulty: Difficulty) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-sm font-bold text-white">Difficulty</span>
        <span className="flex items-center gap-1 text-xs font-semibold text-white/60">
          <ShieldAlert className="h-3.5 w-3.5 text-[#F8C342]" aria-hidden="true" />
          {difficulty}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#07121F]/70 p-1.5">
        {difficulties.map((item) => {
          const active = item.label === difficulty;

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setDifficulty(item.label)}
              aria-pressed={active}
              className={`min-h-16 rounded-xl px-2 text-center transition ${
                active
                  ? "bg-[#F8C342] text-[#07121F] shadow-[0_8px_22px_rgba(248,195,66,0.28)]"
                  : "bg-white/[0.06] text-white/70 hover:bg-white/[0.1] hover:text-white"
              }`}
            >
              <span className="block text-sm font-black">{item.label}</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider opacity-70">
                {item.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompactStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.06] px-1.5 py-2 text-center">
      <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-black leading-none ${accent ? "text-[#F8C342]" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="pb-1 pt-7 text-center text-xs font-semibold text-white/50">
      Scores can be stored on Base Sepolia
    </footer>
  );
}
