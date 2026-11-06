export type ScaleMode = "linear" | "log";

export function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizedValue(value: unknown, unit: string, targetUnit: string): number | null {
  const n = numericValue(value);
  if (n === null) return null;
  const clean = (u: string) => u.toLowerCase().replaceAll(" ", "").replaceAll("³", "3");
  const from = clean(unit), to = clean(targetUnit);
  if (from === to) return n;
  if (from === "gpa" && to === "mpa") return n * 1000;
  if (from === "mpa" && to === "gpa") return n / 1000;
  if (from === "kg/m3" && to === "g/cm3") return n / 1000;
  return null;
}

export function extent(values: number[], mode: ScaleMode): [number, number] {
  const valid = values.filter((v) => Number.isFinite(v) && (mode !== "log" || v > 0));
  if (!valid.length) return mode === "log" ? [1, 10] : [0, 1];
  const min = Math.min(...valid), max = Math.max(...valid);
  if (mode === "log") {
    const a = Math.log10(min), b = Math.log10(max), pad = Math.max((b - a) * .14, .04);
    return [10 ** (a - pad), 10 ** (b + pad)];
  }
  const pad = Math.max((max - min) * .18, Math.abs(max) * .08, .02);
  return [Math.max(0, min - pad), max + pad];
}

export function scale(value: number, domain: [number, number], range: [number, number], mode: ScaleMode): number {
  const t = mode === "log"
    ? (Math.log(value) - Math.log(domain[0])) / (Math.log(domain[1]) - Math.log(domain[0]))
    : (value - domain[0]) / (domain[1] - domain[0]);
  return range[0] + t * (range[1] - range[0]);
}

export function ticks(domain: [number, number], mode: ScaleMode, count = 5): number[] {
  return Array.from({ length: count }, (_, i) => mode === "log"
    ? 10 ** (Math.log10(domain[0]) + (Math.log10(domain[1]) - Math.log10(domain[0])) * i / (count - 1))
    : domain[0] + (domain[1] - domain[0]) * i / (count - 1));
}

export function conditionGroup(condition: string): "dry" | "wet" | "unknown" {
  const s = condition.toLocaleLowerCase("tr");
  if (/ıslak|wet|suda|daldır/.test(s)) return "wet";
  if (/kuru|dry|kurut/.test(s)) return "dry";
  return "unknown";
}

export function numberLabel(n: number, max = 2): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: max });
}
