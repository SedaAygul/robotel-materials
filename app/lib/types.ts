/** Public library records. A source observation is not an apparatus approval. */
export interface Material {
  id: string;
  kind: "Aile" | "Ürün";
  parentId: string | null;
  name: string;
  polymer: string;
  manufacturer: string | null;
  variant?: string | null;
  colorScope?: string | null;
  additivesOrChemistry?: string | null;
  researchTier?: string | null;
  skinContactEvidence?: string | null;
  dataStatus?: string | null;
  lastChecked?: string | null;
  sourceId?: string | null;
  recordStage?: string | null;
  identificationNote?: string | null;
}

export interface Property {
  id: string;
  name: string;
  unit: string;
  description: string;
  use?: string;
  contextRequired: string;
  group: string;
  priority: string;
}

/** Each row retains its own method, direction, conditioning, and process. */
export interface Measurement {
  id: string;
  materialId: string;
  materialName?: string;
  propertyId: string;
  propertyName?: string;
  value: number | string;
  unit: string;
  plusMinus: number | null;
  plusMinusMeaning: string;
  method: string;
  specimen: string;
  direction: string;
  conditioning: string;
  process: string;
  sourceId: string;
  sourceVersion: string;
  sourceLocation: string;
  accessDate?: string;
  evidenceType: string;
  limitation: string;
}

export interface Source {
  id: string;
  type: string;
  title: string;
  publisher: string;
  version: string;
  url: string | null;
  scope: string;
  accessDate?: string;
  evidenceType: string;
  limitation: string;
  licenseStatus?: string;
}

export interface SwimReference {
  id: string;
  kind: string;
  name: string;
  approach: string;
  anatomy: string;
  mechanism: string;
  materialNote: string;
  evidenceStatus: string;
  localStatus: string;
  stlCount: number | null;
  cadStatus: string;
  licenseStatus: string;
  sourceIds: string[];
  url: string | null;
  nextStep: string;
}

export interface Component {
  id: string;
  role: string;
  scope: string;
  materialResearch: string;
  propertyIds: string[];
  referenceIds: string[];
  sourceIds: string[];
  missingEvidence: string;
}

export interface ComparisonRow {
  criterion: string;
  residualLimb: string;
  existingHand: string;
}

export interface ResearchTask {
  id: string;
  scope: string;
  title: string;
  expectedRecord: string;
  status: string;
  owner: string | null;
  priority: string;
  completionCriteria: string;
}

/** Summaries of privately retained source history, not editable site events. */
export interface SeedHistoryEntry {
  id: string;
  groupId: string;
  date: string;
  actorId: string;
  actorName: string;
  kind: "import-summary";
  sourceVersion: string;
  summary: string;
  note: string;
}

export interface SeedData {
  version: "0.4";
  updatedAt: string;
  provenance: {
    title: string;
    sourceVersion: string;
    scope: string;
    privacy: string;
    history: string;
    rights: string;
  };
  materials: Material[];
  properties: Property[];
  measurements: Measurement[];
  sources: Source[];
  swimReferences: SwimReference[];
  components: Component[];
  comparison: ComparisonRow[];
  tasks: ResearchTask[];
  seedHistory: SeedHistoryEntry[];
}
