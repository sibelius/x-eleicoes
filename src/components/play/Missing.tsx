import { missingTweetUrl } from "@/lib/links";
import type { Missing as Row } from "@/lib/social";
import { Face } from "./Face";

/** People you follow who haven't joined yet, each one tap from "@fulano, falta você na minha bolha". */
export function Missing({ rows, base, uid }: { rows: Row[]; base: string; uid: string }) {
  if (!rows.length) return null;
  return (
    <div data-tour="missing" className="mt-4">
      <h3 className="font-semibold">Quem da sua bolha ainda não entrou</h3>
      <p className="text-xs text-subtle">Quem você segue e ainda falta, começando por quem te segue de volta.</p>
      <ul className="mt-2 grid gap-2 text-sm">
        {rows.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <Face src={m.avatar} />
              <span className="min-w-0">
                <span className="block truncate">
                  {m.name} <span className="text-subtle">@{m.username}</span>
                </span>
                <span className="block text-xs text-subtle">
                  {m.mutual ? "te segue · " : ""}
                  {m.members ? `${m.members} ${m.members === 1 ? "membro segue" : "membros seguem"}` : "ninguém daqui segue ainda"}
                </span>
              </span>
            </span>
            <a
              className="shrink-0 rounded-full bg-fg px-3 py-1 text-bg"
              href={missingTweetUrl(base, uid, m.username)}
              target="_blank"
              rel="noreferrer"
            >
              Chamar
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
