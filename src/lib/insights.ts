import "server-only";
import { cacheLife } from "next/cache";
import { getGraphAnalysis } from "./graph";
import { getBubbleLeans } from "./stats";

// Public network analysis: the same for everyone, so computed at most every few minutes.

export async function publicGraph() {
  "use cache: remote";
  cacheLife("minutes");
  return getGraphAnalysis();
}

export async function publicLeans() {
  "use cache: remote";
  cacheLife("minutes");
  return getBubbleLeans();
}
