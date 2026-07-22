import { searchKnowledge } from "../../../lib/knowledge";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";

    if (!query) {
      return Response.json({ error: "Podaj pytanie do bazy wiedzy." }, { status: 400 });
    }

    return Response.json(await searchKnowledge(query));
  } catch (error) {
    return Response.json(
      { error: `Nie udalo sie przeszukac bazy wiedzy. ${getErrorMessage(error)}` },
      { status: 500 },
    );
  }
}
