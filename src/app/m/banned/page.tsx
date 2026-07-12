import { notFound } from "next/navigation";
import { BannedStatusView } from "@/components/banned-status-page";
import { loadModerationSnapshot } from "@/lib/moderation-server";

export const dynamic = "force-dynamic";

export default async function MobileBannedPage() {
  const snapshot = await loadModerationSnapshot();
  if (!snapshot?.banned || !snapshot.ban) notFound();

  return (
    <BannedStatusView
      ban={snapshot.ban}
      hasPendingAppeal={snapshot.hasPendingAppeal}
      variant="mobile"
    />
  );
}
