import { useCallback, useEffect, useMemo, useState } from "react";
import type { LifeChunk, MemoryItem } from "../shared/types";
import { chunkMemoryIds } from "../shared/dateLogic";
import { getLifeChunks, getMemories } from "./api";

export function useTimelineData() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [chunks, setChunks] = useState<LifeChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextMemories, nextChunks] = await Promise.all([getMemories(), getLifeChunks()]);
      setMemories(nextMemories);
      setChunks(nextChunks);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not load timeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const chunkMap = useMemo(() => chunkMemoryIds(memories, chunks), [memories, chunks]);

  return {
    memories,
    chunks,
    chunkMap,
    loading,
    error,
    refresh
  };
}
