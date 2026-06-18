import "server-only";

type SmsMessage = {
  to: string | null;
  body: string;
};

function normalizePhoneNumber(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}

export async function sendSms({ to, body }: SmsMessage) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const normalizedTo = normalizePhoneNumber(to);

  if (!accountSid || !authToken || !from || !normalizedTo) return false;

  const params = new URLSearchParams({
    To: normalizedTo,
    From: from,
    Body: body,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Twilio returned ${response.status}: ${responseBody.slice(0, 300)}`);
  }

  return true;
}
