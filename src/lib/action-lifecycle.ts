import { unstable_rethrow } from "next/navigation";
import type { RideStatus } from "@/lib/types";

export function actionErrorMessage(error: unknown, fallback: string) {
  unstable_rethrow(error);
  return error instanceof Error && error.message ? error.message : fallback;
}

export function deferBestEffort(
  schedule: (task: () => Promise<void>) => void,
  task: () => Promise<void>,
  onError: (error: unknown) => void,
) {
  schedule(async () => {
    try {
      await task();
    } catch (error) {
      onError(error);
    }
  });
}

export function canReserveRide(
  status: RideStatus,
  hasExistingBooking: boolean,
  seatsAvailable: number,
) {
  return status === "active" && !hasExistingBooking && seatsAvailable > 0;
}
