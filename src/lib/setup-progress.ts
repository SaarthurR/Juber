export type SetupItemId = "name" | "photo" | "contact" | "home" | "vehicle";

export type SetupItem = {
  id: SetupItemId;
  label: string;
  done: boolean;
  essential: boolean;
};

export type SetupProgress = {
  items: SetupItem[];
  essentialsDone: number;
  essentialsTotal: number;
  summary: string;
  essentialsComplete: boolean;
};

const ESSENTIAL_IDS: SetupItemId[] = ["name", "photo", "contact"];

export function buildSetupProgress(input: {
  fullName: string | null | undefined;
  avatarUrl: string | null | undefined;
  phone: string | null | undefined;
  whatsapp: string | null | undefined;
  homeAddress: string | null | undefined;
  carMakeModel: string | null | undefined;
}): SetupProgress {
  const items: SetupItem[] = [
    {
      id: "name",
      label: "Name",
      done: Boolean(input.fullName?.trim()),
      essential: true,
    },
    {
      id: "photo",
      label: "Photo",
      done: Boolean(input.avatarUrl?.trim()),
      essential: true,
    },
    {
      id: "contact",
      label: "Contact",
      done: Boolean(input.phone?.trim() || input.whatsapp?.trim()),
      essential: true,
    },
    {
      id: "home",
      label: "Home address",
      done: Boolean(input.homeAddress?.trim()),
      essential: false,
    },
    {
      id: "vehicle",
      label: "Vehicle",
      done: Boolean(input.carMakeModel?.trim()),
      essential: false,
    },
  ];

  const essentials = items.filter((item) => item.essential);
  const essentialsDone = essentials.filter((item) => item.done).length;
  const essentialsTotal = essentials.length;
  const doneLabels = essentials
    .filter((item) => item.done)
    .map((item) => item.label.toLowerCase());
  const summary =
    essentialsDone === essentialsTotal
      ? `${essentialsDone} of ${essentialsTotal} essentials done`
      : `${essentialsDone} of ${essentialsTotal} essentials done${
          doneLabels.length ? `: ${doneLabels.join(", ")}` : ""
        }`;

  return {
    items,
    essentialsDone,
    essentialsTotal,
    summary,
    essentialsComplete: essentialsDone === essentialsTotal,
  };
}

export function essentialItemIds(): readonly SetupItemId[] {
  return ESSENTIAL_IDS;
}
