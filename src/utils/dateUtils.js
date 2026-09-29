function isTimestampLike(value) {
  return !!value && typeof value === "object" && typeof value.toDate === "function";
}

export const APP_TIME_ZONE = "Asia/Aden";
const APP_TIME_ZONE_OFFSET = "+03:00";

const arabicDateFormatter = new Intl.DateTimeFormat("ar", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
});

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const arabicNumberFormatter = new Intl.NumberFormat("ar");

function parseDateKeyParts(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function normalizeInputToDate(input = new Date()) {
  if (input === "" || input == null) return null;
  if (isTimestampLike(input)) return input.toDate();
  if (input instanceof Date) return input;
  if (typeof input === "string") {
    const parts = parseDateKeyParts(input);
    if (parts) return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
    return new Date(input);
  }
  if (typeof input === "number") return new Date(input);
  if (input && typeof input === "object" && typeof input.seconds === "number") {
    return new Date(input.seconds * 1000);
  }
  return new Date(input);
}

export function localDateValue(input = new Date()) {
  const directParts = parseDateKeyParts(input);
  if (directParts) return `${directParts.year}-${String(directParts.month).padStart(2, "0")}-${String(directParts.day).padStart(2, "0")}`;
  const date = normalizeInputToDate(input);
  if (!date || Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(dateKeyFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function today() {
  return localDateValue(new Date());
}

export function parseDateKeyToDate(dateKey) {
  if (dateKey === "" || dateKey == null) return null;
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return normalizeInputToDate(dateKey);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
}

export function compareDate(a, b) {
  const left = parseDateKeyToDate(localDateValue(a));
  const right = parseDateKeyToDate(localDateValue(b));
  const leftTime = left ? left.getTime() : 0;
  const rightTime = right ? right.getTime() : 0;
  return leftTime - rightTime;
}

export function compareTimestamp(a, b) {
  const left = normalizeInputToDate(a);
  const right = normalizeInputToDate(b);
  const leftTime = left && !Number.isNaN(left.getTime()) ? left.getTime() : 0;
  const rightTime = right && !Number.isNaN(right.getTime()) ? right.getTime() : 0;
  return leftTime - rightTime;
}

export function dateRange(start, end) {
  const dates = [];
  const cursor = parseDateKeyToDate(localDateValue(start));
  const last = parseDateKeyToDate(localDateValue(end));
  while (cursor.getTime() <= last.getTime()) {
    dates.push(localDateValue(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function toDateKey(input) {
  return localDateValue(input);
}

export function isThursdayOrFriday(input) {
  const date = parseDateKeyToDate(localDateValue(input));
  if (!date || Number.isNaN(date.getTime())) return false;
  const day = date.getUTCDay();
  return day === 4 || day === 5;
}

export function toStorageTimestamp(input) {
  if (input === "" || input == null) return null;
  const directParts = parseDateKeyParts(input);
  if (directParts) {
    const key = `${directParts.year}-${String(directParts.month).padStart(2, "0")}-${String(directParts.day).padStart(2, "0")}`;
    return new Date(`${key}T12:00:00${APP_TIME_ZONE_OFFSET}`).toISOString();
  }
  const date = normalizeInputToDate(input);
  return !date || Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function nowTimestamp() {
  return new Date().toISOString();
}

export function formatArabicDate(input) {
  const date = normalizeInputToDate(input);
  if (!date || Number.isNaN(date.getTime())) return "";
  return arabicDateFormatter.format(date);
}

export function formatArabicNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value ?? "");
  return arabicNumberFormatter.format(numericValue);
}
