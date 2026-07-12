import { unstable_rethrow } from "next/navigation";
import type { PassengerStatus, RideStatus } from "@/lib/types";

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
  passengerStatus: PassengerStatus | null | undefined,
  seatsAvailable: number,
) {
  const mayRequest =
    passengerStatus == null ||
    passengerStatus === "declined" ||
    passengerStatus === "cancelled";

  return status === "active" && mayRequest && seatsAvailable > 0;
}

export function emptyRideCancellationReason(
  seatsTotal: number,
  seatsAvailable: number,
) {
  return seatsAvailable === seatsTotal
    ? "Ride cancelled before anyone joined."
    : null;
}
