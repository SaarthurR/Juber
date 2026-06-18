import { format } from "date-fns";

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
