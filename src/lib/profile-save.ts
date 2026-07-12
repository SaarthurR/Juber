export const HOME_ADDRESS_MAX_LENGTH = 500;

export type ProfileFormState = { error: string } | null;

export function parseHomeAddress(value: FormDataEntryValue | null) {
  const homeAddress = (value ?? "").toString().trim() || null;
  if (homeAddress && homeAddress.length > HOME_ADDRESS_MAX_LENGTH) {
    throw new Error("Home address must be 500 characters or fewer.");
  }
  return homeAddress;
}

export function profileSaveError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "account_suspended") return "Your account is suspended.";
  if (/home address/i.test(message)) return message;
  return "We couldn't save your profile. Please try again.";
}
