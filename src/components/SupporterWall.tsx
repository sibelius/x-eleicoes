import { getSupporters } from "@/lib/donations";

/** Public, confirmed donors (who opted in), latest first. No amounts. */
export async function SupporterWall() {
  const people = await getSupporters();
  if (!people.length) {
    return <p className="text-sm text-subtle">Ainda ninguém por aqui. Doe e marque “mostrar meu nome no mural” para ser a primeira pessoa 💚</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {people.map((p) => {
        const inner = (
          <>
            {p.avatar ? (
              <img src={p.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-xs">💚</span>
            )}
            <span className="max-w-[12rem] truncate">{p.name}</span>
          </>
        );
        return (
          <li key={`${p.username ?? p.name}-${p.at}`}>
            {p.username ? (
              <a href={`/r/${encodeURIComponent(p.username)}`} className="flex items-center gap-1.5 rounded-full border border-line py-1 pr-3 pl-1 text-sm hover:bg-muted">
                {inner}
              </a>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-line py-1 pr-3 pl-1 text-sm">{inner}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
