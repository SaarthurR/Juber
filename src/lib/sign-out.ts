export const SIGN_OUT_ERROR_MESSAGE =
  "We couldn't sign you out. Please try again.";

export type SignOutState = { error: string } | null;

type SignOutClient = {
  auth: {
    signOut: (options: { scope: "local" }) => Promise<{ error: unknown }>;
  };
};

export async function performSignOut(
  createSignOutClient: () => Promise<SignOutClient>,
): Promise<SignOutState> {
  try {
    const client = await createSignOutClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    return error ? { error: SIGN_OUT_ERROR_MESSAGE } : null;
  } catch {
    return { error: SIGN_OUT_ERROR_MESSAGE };
  }
}

export async function completeSignOut(
  createSignOutClient: () => Promise<SignOutClient>,
  redirectTo: (destination: string) => void,
): Promise<SignOutState> {
  const state = await performSignOut(createSignOutClient);
  if (state) return state;
  redirectTo("/");
  return null;
}
