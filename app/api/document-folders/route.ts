import { getSupabaseAdminMissingMessage, supabaseAdmin } from "../../../lib/supabase-admin";
import { getAuthenticatedRequest } from "../../../lib/supabase-request";

type FolderRequest = {
  name?: unknown;
  description?: unknown;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthenticatedRequest(req);
    const database = supabaseAdmin ?? auth.database;
    const [{ data: folders, error: foldersError }, { data: documents, error: documentsError }] = await Promise.all([
      database
        .from("document_folders")
        .select("id, name, description, created_at, updated_at")
        .eq("user_id", auth.user.id)
        .order("updated_at", { ascending: false }),
      database
        .from("documents")
        .select("folder_id, title")
        .eq("user_id", auth.user.id),
    ]);

    if (foldersError) throw foldersError;
    if (documentsError) throw documentsError;

    const counts = new Map<string, number>();
    const countedDocuments = new Set<string>();
    for (const document of documents ?? []) {
      const documentKey = `${document.folder_id ?? "none"}:${document.title ?? ""}`;
      if (document.folder_id && document.title && !countedDocuments.has(documentKey)) {
        countedDocuments.add(documentKey);
        counts.set(document.folder_id, (counts.get(document.folder_id) ?? 0) + 1);
      }
    }

    return Response.json({
      folders: (folders ?? []).map((folder) => ({
        ...folder,
        document_count: counts.get(folder.id) ?? 0,
      })),
    });
  } catch (error) {
    return Response.json({ folders: [], error: getErrorMessage(error) }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedRequest(req);
    const database = supabaseAdmin ?? auth.database;
    const body = (await req.json()) as FolderRequest;
    const name = cleanText(body.name, 120);
    const description = cleanText(body.description, 500);

    if (!name) {
      return Response.json({ error: "Podaj nazwę folderu lub sprawy." }, { status: 400 });
    }

    const { data, error } = await database
      .from("document_folders")
      .insert({ user_id: auth.user.id, name, description: description || null })
      .select("id, name, description, created_at, updated_at")
      .single();

    if (error) {
      if (error.message.toLowerCase().includes("row-level security")) {
        throw new Error(supabaseAdmin ? error.message : getSupabaseAdminMissingMessage());
      }
      throw error;
    }

    return Response.json({ folder: { ...data, document_count: 0 } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuthenticatedRequest(req);
    const database = supabaseAdmin ?? auth.database;
    const id = new URL(req.url).searchParams.get("id")?.trim();
    const body = (await req.json()) as FolderRequest;
    const name = cleanText(body.name, 120);
    const description = cleanText(body.description, 500);

    if (!id) {
      return Response.json({ error: "Brakuje identyfikatora folderu." }, { status: 400 });
    }

    if (!name) {
      return Response.json({ error: "Podaj nazwę folderu lub sprawy." }, { status: 400 });
    }

    const { data, error } = await database
      .from("document_folders")
      .update({ name, description: description || null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .select("id, name, description, created_at, updated_at")
      .single();

    if (error) {
      if (error.message.toLowerCase().includes("row-level security")) {
        throw new Error(supabaseAdmin ? error.message : getSupabaseAdminMissingMessage());
      }
      throw error;
    }

    return Response.json({ folder: { ...data, document_count: 0 } });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthenticatedRequest(req);
    const database = supabaseAdmin ?? auth.database;
    const id = new URL(req.url).searchParams.get("id")?.trim();

    if (!id) {
      return Response.json({ error: "Brakuje identyfikatora folderu." }, { status: 400 });
    }

    const { error } = await database
      .from("document_folders")
      .delete()
      .eq("id", id)
      .eq("user_id", auth.user.id);

    if (error) {
      if (error.message.toLowerCase().includes("row-level security")) {
        throw new Error(supabaseAdmin ? error.message : getSupabaseAdminMissingMessage());
      }
      throw error;
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
