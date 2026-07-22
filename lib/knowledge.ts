import { generateEmbedding } from "./embeddings";
import { supabase } from "./supabase";
import { supabaseAdmin } from "./supabase-admin";

type MatchDocument = {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

type DocumentRow = {
  id: string;
  created_at: string | null;
};

const queryStopWords = new Set([
  "ile",
  "jaki",
  "jaka",
  "jakie",
  "jest",
  "sa",
  "czy",
  "mog",
  "moge",
  "mozna",
  "kosztuje",
  "koszt",
  "cena",
  "ceny",
  "pakiet",
  "pakietu",
  "usluga",
  "uslugi",
]);

function normalizeForSearch(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

function getQueryTerms(query: string) {
  return normalizeForSearch(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !queryStopWords.has(term))
    .map((term) => (term.length > 6 ? term.slice(0, 6) : term));
}

function hasLexicalSupport(query: string, documentText: string) {
  const terms = getQueryTerms(query);

  if (terms.length === 0) {
    return true;
  }

  const normalizedDocument = normalizeForSearch(documentText);
  const documentTerms = normalizedDocument.split(/\s+/).filter(Boolean);

  return terms.some((term) =>
    documentTerms.some((documentTerm) => {
      if (term.length < 4 || documentTerm.length < 4) {
        return false;
      }

      if (documentTerm.includes(term) || term.includes(documentTerm)) {
        return true;
      }

      // Polish inflected forms can have different endings, e.g. "chrzest"
      // and "chrztu". A four-letter stem keeps the match useful without
      // allowing unrelated words such as "tesla" through.
      const stemLength = Math.min(4, term.length, documentTerm.length);
      return stemLength >= 4 && term.slice(0, stemLength) === documentTerm.slice(0, stemLength);
    }),
  );
}

export async function searchKnowledge(query: string) {
  const database = supabaseAdmin ?? supabase;
  const cleanedQuery = query.trim();

  if (!database) {
    return {
      results: [],
      total_found: 0,
      message: "Brakuje konfiguracji Supabase.",
    };
  }

  if (!cleanedQuery) {
    return {
      results: [],
      total_found: 0,
      message: "Podaj pytanie do wyszukania w bazie wiedzy.",
    };
  }

  const embedding = await generateEmbedding(cleanedQuery);
  const { data, error } = await database.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: 5,
  });

  if (error) {
    return {
      results: [],
      total_found: 0,
      message: `Nie udalo sie przeszukac bazy wiedzy: ${error.message}`,
    };
  }

  const matches = (data ?? []) as MatchDocument[];
  const createdAtById = new Map<string, string | null>();

  if (matches.length > 0) {
    const { data: documents } = await database
      .from("documents")
      .select("id, created_at")
      .in(
        "id",
        matches.map((item) => item.id),
      );

    for (const document of (documents ?? []) as DocumentRow[]) {
      createdAtById.set(document.id, document.created_at);
    }
  }

  const results = matches
    .filter((item) =>
      hasLexicalSupport(
        cleanedQuery,
        `${item.title} ${item.content} ${JSON.stringify(item.metadata ?? {})}`,
      ),
    )
    .map((item) => ({
      title: item.title,
      content: item.content,
      similarity: Number(item.similarity.toFixed(3)),
      metadata: item.metadata ?? {},
      added_at: createdAtById.get(item.id) ?? null,
    }));
  const source_documents = Array.from(
    new Set(results.map((item) => item.title).filter(Boolean)),
  );

  return results.length > 0
    ? { results, total_found: results.length, source_documents }
    : {
        results: [],
        total_found: 0,
        source_documents: [],
        message: "Nie znaleziono informacji w bazie wiedzy.",
      };
}
