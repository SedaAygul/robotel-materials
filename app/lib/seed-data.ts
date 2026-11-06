import publicSeed from "../../data/seed-public.json";
import type { SeedData } from "./types";

// This committed, sanitized snapshot is the public baseline. Accepted site
// contributions are recorded separately by the server's revision history.
export const seedData: SeedData = publicSeed as SeedData;
