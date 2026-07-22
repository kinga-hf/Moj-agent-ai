const defaultEmbeddingModel = "gemini-embedding-001";
const embeddingDimensions = 768;

function getGoogleApiKey() {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
}

function getEmbeddingModel() {
  return process.env.GOOGLE_EMBEDDING_MODEL || defaultEmbeddingModel;
}

export async function generateEmbedding(text: string) {
  const apiKey = getGoogleApiKey();
  const cleanText = text.trim();

  if (!apiKey) {
    throw new Error("Brakuje GOOGLE_GENERATIVE_AI_API_KEY lub GOOGLE_API_KEY w .env.local.");
  }

  if (!cleanText) {
    throw new Error("Tekst do embeddingu nie moze byc pusty.");
  }

  const model = getEmbeddingModel().replace(/^models\//, "");
  const modelName = `models/${model}`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${modelName}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        content: {
          parts: [{ text: cleanText }],
        },
        outputDimensionality: embeddingDimensions,
      }),
    },
  );

  const data = (await response.json()) as {
    embedding?: { values?: number[] };
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message || `Embedding API zwrocilo blad ${response.status}.`);
  }

  const values = data.embedding?.values;

  if (!Array.isArray(values) || values.length !== embeddingDimensions) {
    throw new Error(
      `Embedding z modelu ${modelName} ma niepoprawny rozmiar: ${values?.length ?? 0}. Oczekiwano ${embeddingDimensions}.`,
    );
  }

  return values;
}
