import type { Cv, Draft, Profile } from "../types.js";
import { mentions } from "./tailoring.js";

export function contextualizeTechnologies(
  cv: Cv,
  draft: Draft,
  profile: Profile,
  description: string,
): Cv {
  // New drafts select a concise, confirmed company stack explicitly.
  // Drafts without presentation retain the legacy full-stack rendering.
  const catalog = [
    ...new Set([
      ...profile.skills.filter((s) => !["Agile", "BDD"].includes(s)),
      "Context API",
    ]),
  ];
  const experiences = cv.experiences.map((e) => {
    const source = profile.experiences.find(
      (s) => s.company === e.company && s.period === e.period,
    );
    const available = source
      ? catalog.filter((skill) =>
          source.facts.some((f) => mentions(f.text, skill)),
        )
      : [];
    const selected =
      draft.presentation?.technologySelections.find(
        (s) => s.sourceId === source?.id,
      )?.technologies ?? [];
    const technologies = draft.presentation
      ? selected.filter((s) => source?.facts.some((f) => mentions(f.text, s)))
      : available;

    return { ...e, technologies };
  });
  const studies = (profile.studies ?? []).filter((s) =>
    mentions(description, s),
  );
  const education = draft.presentation
    ? cv.education.filter((_, index) =>
        draft.presentation!.educationIndices.includes(index),
      )
    : cv.education;

  return {
    ...cv,
    education,
    layoutVersion: "experience-first-v1",
    experiences,
    ...(studies.length ? { studies } : {}),
  };
}
