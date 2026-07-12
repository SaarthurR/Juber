import { format } from "date-fns";

const APP_TIME_ZONE = "America/Los_Angeles";

export function getTodayDateInputValue(date = new Date()) {
  return getDateTimeParts(date).slice(0, 3).join("-");
}

export function getDateTimeInputValue(date = new Date()) {
  const [year, month, day, hour, minute] = getDateTimeParts(date);

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function dateOnlyToIso(value: string, time = "12:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Please choose a valid date.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    Number.isNaN(utcGuess.getTime())
  ) {
    throw new Error("Please choose a valid date.");
  }

  const parts = getDateTimeParts(utcGuess).map(Number);
  const diff =
    Date.UTC(year, month - 1, day, hour, minute) -
    Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
  const date = new Date(utcGuess.getTime() + diff);
  const [actualYear, actualMonth, actualDay, actualHour, actualMinute] = getDateTimeParts(date);
  if (
    `${actualYear}-${actualMonth}-${actualDay}` !== value ||
    `${actualHour}:${actualMinute}` !== time
  ) {
    throw new Error("Please choose a valid date.");
  }

  return date.toISOString();
}

export function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  if (year > 9998) return null;
  try {
    dateOnlyToIso(value);
    return value;
  } catch {
    return null;
  }
}

function getDateTimeParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return [values.year, values.month, values.day, values.hour, values.minute];
}

// Ride datetimes are stored as UTC-shaped wall times. Rebuild them from their
// date parts so browser timezone conversion cannot change the displayed time.
export function formatRideDateTime(value: string, pattern: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?/,
  );

  if (!match) return format(new Date(value), pattern);

  const [, year, month, day, hour, minute, second = "0", milliseconds = "0"] = match;
  const wallTime = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(milliseconds.padEnd(3, "0")),
  );

  return format(wallTime, pattern);
}
