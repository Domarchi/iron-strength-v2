type SearchableTemplate = {
  name: string;
  sessions: { title?: string | null; exercises: { name: string }[] }[];
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
export function filterTemplates<T extends SearchableTemplate>(templates: T[], search: string): T[] {
  const needle = normalize(search);
  return templates.filter((t) =>
    normalize(
      [
        t.name,
        ...t.sessions.flatMap((s) => [s.title ?? "", ...s.exercises.map((e) => e.name)]),
      ].join(" "),
    ).includes(needle),
  );
}
