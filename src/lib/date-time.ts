import { format } from "date-fns";

const APP_TIME_ZONE = "America/Los_Angeles";

export function getTodayDateInputValue(date = new Date()) {
  return getDateTimeParts(date).slice(0, 3).join("-");
}

export function getDateTimeInputValue(date = new Date()) {
  const [year, month, day, hour, minute] = getDateTimeParts(date);

  return `${year}-${month}-${day}T${hour}:${minute}`;
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
