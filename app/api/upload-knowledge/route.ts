import { splitIntoChunks } from "../../../lib/chunking";
import { generateEmbedding } from "../../../lib/embeddings";
import {
  getSupabaseAdminMissingMessage,
  supabaseAdmin,
} from "../../../lib/supabase-admin";
import { getAuthenticatedRequest } from "../../../lib/supabase-request";

type UploadKnowledgeRequest = {
  title?: unknown;
  content?: unknown;
};

type KnowledgeDocument = {
  title: string | null;
  created_at: string | null;
  metadata: { total_chunks?: number } | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function validateBody(body: UploadKnowledgeRequest) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!title) {
    throw new Error("Podaj tytul dokumentu.");
  }

  if (!content) {
    throw new Error("Wklej tresc dokumentu.");
  }

  return { title, content };
}

async function saveKnowledge(
  database: NonNullable<typeof supabaseAdmin>,
  userId: string,
  title: string,
  content: string,
  onProgress?: (event: Record<string, unknown>) => void,
) {
  const chunks = splitIntoChunks(content);

  if (chunks.length === 0) {
    throw new Error("Nie udalo sie podzielic dokumentu na fragmenty.");
  }

  onProgress?.({ type: "start", total_chunks: chunks.length });

  for (const [index, chunk] of chunks.entries()) {
    onProgress?.({
      type: "progress",
      chunk_index: index + 1,
      total_chunks: chunks.length,
      message: `Przetwarzam fragment ${index + 1} z ${chunks.length}...`,
    });

    const embedding = await generateEmbedding(chunk);
    const { error } = await database.from("documents").insert({
      user_id: userId,
      title,
      content: chunk,
      embedding,
      metadata: {
        source: title,
        chunk_index: index,
        total_chunks: chunks.length,
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes("row-level security")) {
        throw new Error(
          supabaseAdmin ? error.message : getSupabaseAdminMissingMessage(),
        );
      }

      throw new Error(error.message);
    }
  }

  return { success: true, chunks_saved: chunks.length };
}

export async function GET(req: Request) {
  let auth;

  try {
    auth = await getAuthenticatedRequest(req);
  } catch (error) {
    return Response.json({ documents: [], error: getErrorMessage(error) }, { status: 401 });
  }

  const database = supabaseAdmin ?? auth.database;

  const { data, error } = await database
    .from("documents")
    .select("title, created_at, metadata")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ documents: [], error: error.message }, { status: 500 });
  }

  const documents = new Map<
    string,
    { title: string; chunks: number; created_at: string; updated_at: string }
  >();

  for (const item of (data ?? []) as KnowledgeDocument[]) {
    const title = item.title?.trim();

    if (!title) {
      continue;
    }

    const createdAt = item.created_at ?? new Date().toISOString();
    const existing = documents.get(title);

    if (!existing) {
      documents.set(title, {
        title,
        chunks: 1,
        created_at: createdAt,
        updated_at: createdAt,
      });
      continue;
    }

    existing.chunks += 1;
    if (createdAt < existing.created_at) existing.created_at = createdAt;
    if (createdAt > existing.updated_at) existing.updated_at = createdAt;
  }

  return Response.json({ documents: Array.from(documents.values()) });
}

export async function POST(req: Request) {
  const streamMode = new URL(req.url).searchParams.get("stream") === "1";

  try {
    const auth = await getAuthenticatedRequest(req);
    const database = supabaseAdmin ?? auth.database;
    const { title, content } = validateBody((await req.json()) as UploadKnowledgeRequest);

    if (!streamMode) {
      return Response.json(await saveKnowledge(database, auth.user.id, title, content));
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        try {
          const result = await saveKnowledge(database, auth.user.id, title, content, send);
          send({ type: "done", ...result });
        } catch (error) {
          send({ type: "error", error: getErrorMessage(error) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);

    if (streamMode) {
      return new Response(`${JSON.stringify({ type: "error", error: message })}\n`, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
        status: 400,
      });
    }

    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthenticatedRequest(req);
    const database = supabaseAdmin ?? auth.database;
    const { title } = validateBody({
      title: new URL(req.url).searchParams.get("title"),
      content: "delete",
    });
    const { error } = await database
      .from("documents")
      .delete()
      .eq("title", title)
      .eq("user_id", auth.user.id);

    if (error) {
      if (error.message.toLowerCase().includes("row-level security")) {
        throw new Error(
          supabaseAdmin ? error.message : getSupabaseAdminMissingMessage(),
        );
      }

      throw new Error(error.message);
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
