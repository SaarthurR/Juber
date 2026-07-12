export const CONTACT_STEP_ERROR =
  "Add a phone or WhatsApp number to continue.";

export function contactStepCanAdvance(phone: string, whatsapp: string): boolean {
  return phone.trim().length > 0 || whatsapp.trim().length > 0;
}

export function optionalStepCanSkip(optional: boolean | undefined): boolean {
  return optional === true;
}

export function validateStepContainer(
  container: HTMLElement | null,
  setError: (message: string | null) => void,
): boolean {
  if (!container) return false;

  const phone = container.querySelector<HTMLInputElement>('input[name="phone"]');
  const whatsapp = container.querySelector<HTMLInputElement>(
    'input[name="whatsapp"]',
  );
  if (phone) phone.setCustomValidity("");
  if (whatsapp) whatsapp.setCustomValidity("");

  const inputs = container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "input, select, textarea",
  );
  for (const input of inputs) {
    if (!input.reportValidity()) {
      return false;
    }
  }

  if (phone && whatsapp) {
    if (!contactStepCanAdvance(phone.value, whatsapp.value)) {
      phone.setCustomValidity(CONTACT_STEP_ERROR);
      phone.reportValidity();
      setError(CONTACT_STEP_ERROR);
      return false;
    }
  }

  setError(null);
  return true;
}
