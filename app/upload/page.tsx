"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DashboardSidebar } from "../components/DashboardSidebar";
import { useAuth } from "../components/AuthGate";
import { supabase } from "../../lib/supabase";
import { GoldIcon } from "../components/GoldIcon";

type KnowledgeDocument = {
  title: string;
  chunks: number;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
};

type KnowledgeFolder = {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
  created_at: string;
  updated_at: string;
};

type KnowledgeSearchResult = {
  title: string;
  content: string;
  similarity: number;
  added_at?: string | null;
};

type UploadEvent =
  | { type: "start"; total_chunks: number }
  | { type: "progress"; chunk_index: number; total_chunks: number; message: string }
  | { type: "done"; success: true; chunks_saved: number }
  | { type: "error"; error: string };

const examples = [
  {
    label: "Pozew o zapłatę",
    title: "Pozew o zapłatę — przykład",
    content: `POZEW O ZAPŁATĘ

Powód wnosi o zasądzenie należności głównej wraz z odsetkami ustawowymi za opóźnienie oraz kosztami procesu.

Podstawą roszczenia jest umowa o świadczenie usług zawarta przez strony. Powód wskazuje, że usługa została wykonana, a faktura nie została opłacona w terminie.

Do pozwu dołączono umowę, fakturę, wezwanie do zapłaty oraz potwierdzenie doręczenia wezwania. Do weryfikacji pozostaje zakres wykonanych usług i prawidłowość wyliczenia odsetek.`,
  },
  {
    label: "Sprzeciw od nakazu",
    title: "Sprzeciw od nakazu zapłaty — przykład",
    content:
      "SPRZECIW OD NAKAZU ZAPŁATY. Pozwany zaskarża nakaz zapłaty w całości i wnosi o oddalenie powództwa. Podnosi zarzut przedawnienia, brak wykazania wymagalności roszczenia oraz brak prawidłowego doręczenia wezwania do zapłaty. Wnosi o dopuszczenie dowodu z umowy, korespondencji stron i przesłuchania świadka.",
  },
  {
    label: "Umowa i aneks",
    title: "Umowa z aneksem — przykład",
    content:
      "UMOWA I ANEKS. Strony zawarły umowę o współpracy na czas określony. Aneks zmienił termin wykonania świadczenia oraz wysokość wynagrodzenia. Należy porównać zakres zmian z pierwotną umową i ustalić, czy aneks został podpisany przez osoby uprawnione do reprezentacji.",
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));
}

export default function UploadPage() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [editedFolderName, setEditedFolderName] = useState("");
  const [editedFolderDescription, setEditedFolderDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeSearchResult[]>([]);
  const [isSearchingKnowledge, setIsSearchingKnowledge] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const progressPercent = useMemo(() => {
    if (!progressTotal) {
      return isUploading ? 8 : 0;
    }

    return Math.min(100, Math.round((progressCurrent / progressTotal) * 100));
  }, [isUploading, progressCurrent, progressTotal]);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!supabase) {
      return {};
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadDocuments() {
    setIsLoadingList(true);

    try {
      const headers = await getAuthHeaders();
      const [documentsResponse, foldersResponse] = await Promise.all([
        fetch("/api/upload-knowledge", { cache: "no-store", headers }),
        fetch("/api/document-folders", { cache: "no-store", headers }),
      ]);
      const data = (await documentsResponse.json()) as {
        documents?: KnowledgeDocument[];
        error?: string;
      };
      const folderData = (await foldersResponse.json()) as {
        folders?: KnowledgeFolder[];
        error?: string;
      };

      if (!documentsResponse.ok) {
        throw new Error(data.error || "Nie udalo sie pobrac dokumentow.");
      }
      if (!foldersResponse.ok) {
        throw new Error(folderData.error || "Nie udalo sie pobrac folderow.");
      }

      setDocuments(data.documents ?? []);
      setFolders(folderData.folders ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie pobrac dokumentow.");
    } finally {
      setIsLoadingList(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [user]);

  function useExample(index: number) {
    const example = examples[index];
    setTitle(example.title);
    setContent(example.content);
    setError("");
    setSuccess("");
  }

  async function importDocumentFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || isUploading || isReadingFile) {
      return;
    }

    setIsReadingFile(true);
    setError("");
    setSuccess("");
    setSelectedFileName(file.name);

    try {
      let importedText = "";
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      if (file.size > 12 * 1024 * 1024) {
        throw new Error("Plik jest za duży. Maksymalny rozmiar to 12 MB.");
      }

      if (isPdf) {
        const response = await fetch("/api/legal-opposition/parse-pdf", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: (() => {
            const formData = new FormData();
            formData.append("file", file);
            return formData;
          })(),
        });
        const data = (await response.json()) as { text?: string; error?: string };

        if (!response.ok || !data.text) {
          throw new Error(data.error || "Nie udało się odczytać pliku PDF.");
        }

        importedText = data.text;
      } else {
        importedText = await file.text();
      }

      if (!importedText.trim()) {
        throw new Error("Plik nie zawiera tekstu możliwego do zapisania.");
      }

      setTitle((current) => current.trim() || file.name.replace(/\.[^/.]+$/, ""));
      setContent(importedText.slice(0, 40000));
      setSuccess(`Wczytano „${file.name}”. Wybierz sprawę i zapisz dokument.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udało się wczytać pliku.");
      setSelectedFileName("");
    } finally {
      setIsReadingFile(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || !content.trim() || isUploading) {
      return;
    }

    setIsUploading(true);
    setError("");
    setSuccess("");
    setProgressCurrent(0);
    setProgressTotal(0);
    setProgressMessage("Dziele tekst na fragmenty...");

    try {
      const response = await fetch("/api/upload-knowledge?stream=1", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content,
          folderId: activeFolderId === "all" ? null : activeFolderId,
        }),
      });

      if (!response.body) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Serwer nie zwrocil postepu przetwarzania.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const update = JSON.parse(line) as UploadEvent;

          if (update.type === "start") {
            setProgressTotal(update.total_chunks);
            setProgressMessage(`Znalazlem ${update.total_chunks} fragmentow.`);
          }

          if (update.type === "progress") {
            setProgressCurrent(update.chunk_index);
            setProgressTotal(update.total_chunks);
            setProgressMessage(update.message);
          }

          if (update.type === "done") {
            setProgressCurrent(update.chunks_saved);
            setProgressTotal(update.chunks_saved);
            setSuccess(`Zapisano ${update.chunks_saved} fragmentow.`);
            setTitle("");
            setContent("");
          }

          if (update.type === "error") {
            throw new Error(update.error);
          }
        }
      }

      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie zapisac dokumentu.");
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteDocument(documentTitle: string, folderId: string | null) {
    if (isUploading) {
      return;
    }

    const confirmed = window.confirm(`Usunac dokument "${documentTitle}" z bazy wiedzy?`);

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const folderQuery = folderId ? `&folderId=${encodeURIComponent(folderId)}` : "";
      const response = await fetch(`/api/upload-knowledge?title=${encodeURIComponent(documentTitle)}${folderQuery}`, {
        method: "DELETE",
        headers: await getAuthHeaders(),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Nie udalo sie usunac dokumentu.");
      }

      setSuccess(`Usunieto dokument "${documentTitle}".`);
      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie usunac dokumentu.");
    }
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newFolderName.trim();

    if (!name || isCreatingFolder || isUploading) {
      return;
    }

    setIsCreatingFolder(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/document-folders", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as { folder?: KnowledgeFolder; error?: string };

      if (!response.ok || !data.folder) {
        throw new Error(data.error || "Nie udalo sie utworzyc folderu.");
      }

      setNewFolderName("");
      setActiveFolderId(data.folder.id);
      setSuccess(`Utworzono sprawe „${data.folder.name}”.`);
      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie utworzyc folderu.");
    } finally {
      setIsCreatingFolder(false);
    }
  }

  async function deleteFolder(folder: KnowledgeFolder) {
    if (isUploading || isCreatingFolder) {
      return;
    }

    const confirmed = window.confirm(
      `Usunac sprawe „${folder.name}”? Dokumenty zostana zachowane bez przypisanego folderu.`,
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/document-folders?id=${encodeURIComponent(folder.id)}`, {
        method: "DELETE",
        headers: await getAuthHeaders(),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Nie udalo sie usunac sprawy.");
      }

      if (activeFolderId === folder.id) {
        setActiveFolderId("all");
      }
      setSuccess(`Usunieto sprawe „${folder.name}”. Dokumenty pozostaly w bazie.`);
      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie usunac sprawy.");
    }
  }

  function startEditingFolder(folder: KnowledgeFolder) {
    setEditedFolderName(folder.name);
    setEditedFolderDescription(folder.description ?? "");
    setIsEditingFolder(true);
    setError("");
    setSuccess("");
  }

  async function saveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const folder = folders.find((item) => item.id === activeFolderId);

    if (!folder || !editedFolderName.trim() || isCreatingFolder || isUploading) {
      return;
    }

    setIsCreatingFolder(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/document-folders?id=${encodeURIComponent(folder.id)}`, {
        method: "PATCH",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editedFolderName,
          description: editedFolderDescription,
        }),
      });
      const data = (await response.json()) as { folder?: KnowledgeFolder; error?: string };

      if (!response.ok || !data.folder) {
        throw new Error(data.error || "Nie udalo sie zmodyfikowac sprawy.");
      }

      setIsEditingFolder(false);
      setSuccess(`Zaktualizowano sprawe „${data.folder.name}”.`);
      await loadDocuments();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie zmodyfikowac sprawy.");
    } finally {
      setIsCreatingFolder(false);
    }
  }

  async function searchKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = knowledgeQuery.trim();
    if (!query || isSearchingKnowledge) {
      return;
    }

    setIsSearchingKnowledge(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/search-knowledge", {
        method: "POST",
        headers: {
          ...(await getAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });
      const data = (await response.json()) as {
        results?: KnowledgeSearchResult[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Nie udalo sie przeszukac bazy wiedzy.");
      }

      setKnowledgeResults(data.results ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Nie udalo sie przeszukac bazy wiedzy.");
    } finally {
      setIsSearchingKnowledge(false);
    }
  }

  const visibleDocuments = activeFolderId === "all"
    ? documents
    : documents.filter((document) => document.folder_id === activeFolderId);
  const activeFolder = folders.find((folder) => folder.id === activeFolderId);

  return (
    <main className="dashboard-shell">
      <DashboardSidebar />

      <section className="dashboard-main" aria-label="Baza wiedzy">
        <header className="dashboard-hero">
          <div>
            <span className="agent-header-badge">LEXAI • BAZA DOKUMENTÓW</span>
            <h1><GoldIcon name="knowledge" size={30} /> Baza dokumentów</h1>
            <p>Twórz foldery dla konkretnych spraw i trzymaj pisma, notatki oraz materiały procesowe w jednym miejscu.</p>
          </div>
          <div className="dashboard-status">
            <span>{isUploading ? "Przetwarzam" : "Gotowe do zapisu"}</span>
          </div>
        </header>

        <section className="upload-card folder-manager" aria-label="Sprawy i foldery">
          <div className="dashboard-card-top">
            <div>
              <span>Sprawy i foldery</span>
              <p>Wybierz sprawę, aby przeglądać przypisane do niej dokumenty.</p>
            </div>
            <em>{folders.length} spraw</em>
          </div>

          <div className="folder-manager-row">
            <div className="folder-chips">
              <button
                className={activeFolderId === "all" ? "is-active" : ""}
                onClick={() => {
                  setActiveFolderId("all");
                  setIsEditingFolder(false);
                }}
                type="button"
              >
                Wszystkie dokumenty <span>{documents.length}</span>
              </button>
              {folders.map((folder) => (
                <button
                  className={activeFolderId === folder.id ? "is-active" : ""}
                  key={folder.id}
                  onClick={() => {
                    setActiveFolderId(folder.id);
                    setIsEditingFolder(false);
                  }}
                  type="button"
                >
                  <GoldIcon name="folder" size={16} /> {folder.name} <span>{folder.document_count}</span>
                </button>
              ))}
            </div>

            <form className="folder-create-form" onSubmit={createFolder}>
              <input
                aria-label="Nazwa nowej sprawy"
                disabled={isCreatingFolder || isUploading}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Nazwa nowej sprawy"
                value={newFolderName}
              />
              <button disabled={isCreatingFolder || isUploading || !newFolderName.trim()} type="submit">
                {isCreatingFolder ? "Tworzę..." : "+ Nowa sprawa"}
              </button>
            </form>
          </div>

          {folders.length === 0 ? (
            <p className="folder-manager-empty">Nie masz jeszcze folderów. Utwórz pierwszą sprawę, aby uporządkować dokumenty.</p>
          ) : activeFolder ? (
            isEditingFolder ? (
              <form className="folder-edit-form" onSubmit={saveFolder}>
                <div>
                  <label>
                    <span>Nazwa sprawy</span>
                    <input
                      disabled={isCreatingFolder || isUploading}
                      onChange={(event) => setEditedFolderName(event.target.value)}
                      value={editedFolderName}
                    />
                  </label>
                  <label>
                    <span>Opis sprawy (opcjonalnie)</span>
                    <textarea
                      disabled={isCreatingFolder || isUploading}
                      onChange={(event) => setEditedFolderDescription(event.target.value)}
                      placeholder="Np. spór o zapłatę z umowy B2B"
                      value={editedFolderDescription}
                    />
                  </label>
                </div>
                <div>
                  <button disabled={isCreatingFolder || isUploading || !editedFolderName.trim()} type="submit">
                    {isCreatingFolder ? "Zapisuję..." : "Zapisz zmiany"}
                  </button>
                  <button disabled={isCreatingFolder || isUploading} onClick={() => setIsEditingFolder(false)} type="button">
                    Anuluj
                  </button>
                </div>
              </form>
            ) : (
              <div className="folder-manager-active">
                <span><GoldIcon name="folder" size={15} /> Otwarta sprawa: <strong>{activeFolder.name}</strong></span>
                <div>
                  <button disabled={isUploading || isCreatingFolder} onClick={() => startEditingFolder(activeFolder)} type="button">
                    Edytuj
                  </button>
                  <button disabled={isUploading || isCreatingFolder} onClick={() => void deleteFolder(activeFolder)} type="button">
                    Usuń folder
                  </button>
                </div>
              </div>
            )
          ) : null}
        </section>

        {error ? <div className="dashboard-error">{error}</div> : null}
        {success ? <div className="upload-success">{success}</div> : null}

        <section className="upload-layout">
          <form className="upload-card upload-form" onSubmit={handleSubmit}>
            <div className="dashboard-card-top">
              <span>Nowy dokument</span>
              <em>{content.trim().length} znakow</em>
            </div>

            <label className="upload-field">
              <span>Tytul dokumentu</span>
              <input
                disabled={isUploading || isReadingFile}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Np. Pozew o zapłatę — sygn. I C 123/26"
                value={title}
              />
            </label>

            <label className="upload-field">
              <span>Przypisz do sprawy</span>
              <select
                disabled={isUploading || isReadingFile}
                onChange={(event) => setActiveFolderId(event.target.value || "all")}
                value={activeFolderId === "all" ? "" : activeFolderId}
              >
                <option value="">Bez folderu</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </label>

            <div className="upload-file-import">
              <input
                accept=".pdf,.txt,.md,.rtf,.csv,application/pdf,text/plain,text/markdown,application/rtf,text/csv"
                className="hidden-file-input"
                onChange={importDocumentFile}
                ref={fileInputRef}
                type="file"
              />
              <button disabled={isUploading || isReadingFile} onClick={() => fileInputRef.current?.click()} type="button">
                {isReadingFile ? "Wczytuję plik..." : "Wybierz plik PDF/TXT"}
              </button>
              <span>{selectedFileName || "albo wklej treść poniżej"}</span>
            </div>

            <label className="upload-field">
              <span>Tresc dokumentu</span>
              <textarea
                disabled={isUploading || isReadingFile}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Wklej tutaj tresc dokumentu..."
                value={content}
              />
            </label>

            <div className="upload-examples" aria-label="Przykladowe dokumenty">
              {examples.map((example, index) => (
                <button
                  disabled={isUploading || isReadingFile}
                  key={example.label}
                  onClick={() => useExample(index)}
                  type="button"
                >
                  {example.label}
                </button>
              ))}
            </div>

            <div className="upload-progress" aria-label="Postep zapisu">
              <div>
                <span>{progressMessage || "Czekam na dokument."}</span>
                <strong>{progressPercent}%</strong>
              </div>
              <progress max={100} value={progressPercent} />
            </div>

            <button className="send-button upload-submit" disabled={isUploading || isReadingFile || !title.trim() || !content.trim()} type="submit">
              {isUploading ? "Zapisuje..." : "Zapisz w bazie wiedzy"}
            </button>
          </form>

          <section className="upload-card upload-list">
            <div className="dashboard-card-top">
              <div>
                <span>{activeFolder ? `Dokumenty: ${activeFolder.name}` : "Zapisane dokumenty"}</span>
                <p>{activeFolder ? "Materiały przypisane do tej sprawy." : "Wszystkie dokumenty w Twojej bazie."}</p>
              </div>
              <em>{isLoadingList ? "Laduje..." : `${visibleDocuments.length} pozycji`}</em>
            </div>

            {isLoadingList ? (
              <p className="upload-empty">Pobieram liste dokumentow.</p>
            ) : visibleDocuments.length === 0 ? (
              <p className="upload-empty">Ten folder nie zawiera jeszcze dokumentów.</p>
            ) : (
              <div className="upload-documents">
                {visibleDocuments.map((document) => (
                  <article className="upload-document" key={`${document.folder_id ?? "none"}-${document.title}`}>
                    <div>
                      <h2>{document.title}</h2>
                      <p>
                        {document.chunks} fragmentów · dodano {formatDate(document.created_at)}
                      </p>
                    </div>
                    <button
                      aria-label={`Usun dokument ${document.title}`}
                      disabled={isUploading}
                      onClick={() => void deleteDocument(document.title, document.folder_id)}
                      type="button"
                    >
                      Usun
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="upload-card upload-search">
            <div className="dashboard-card-top">
              <span>Wyszukiwarka dokumentów</span>
              <em>{knowledgeResults.length} wynikow</em>
            </div>

            <form className="upload-search-form" onSubmit={searchKnowledge}>
              <label className="upload-field">
                <span>Zapytaj o dokumenty w sprawie</span>
                <input
                  disabled={isSearchingKnowledge}
                  onChange={(event) => setKnowledgeQuery(event.target.value)}
                  placeholder="Np. jakie zarzuty podniesiono w sprzeciwie od nakazu zapłaty?"
                  value={knowledgeQuery}
                />
              </label>
              <button className="send-button upload-submit" disabled={isSearchingKnowledge || !knowledgeQuery.trim()} type="submit">
                {isSearchingKnowledge ? "Szukam..." : "Szukaj"}
              </button>
            </form>

            {knowledgeResults.length === 0 ? (
              <p className="upload-empty">Zapytaj o zarzuty, dowody, daty lub podstawy prawne wskazane w dokumentach.</p>
            ) : (
              <div className="knowledge-results">
                {knowledgeResults.map((result, index) => (
                  <article className="knowledge-result" key={`${result.title}-${index}`}>
                    <div>
                      <strong>{result.title}</strong>
                      <span>similarity {result.similarity}</span>
                    </div>
                    <p>{result.content}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
