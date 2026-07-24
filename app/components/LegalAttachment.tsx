"use client";

import {
  ChangeEvent,
  DragEvent,
  MutableRefObject,
  useRef,
  useState,
} from "react";
import { supabase } from "../../lib/supabase";

const maxLegalFileSize = 12 * 1024 * 1024;
const maxLegalTextLength = 18000;

export type AttachedLegalFile = {
  name: string;
  text: string;
};

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isSupportedLegalFile(file: File) {
  return isPdf(file) || /\.(txt|md|rtf|csv|log)$/i.test(file.name);
}

async function readLegalFile(file: File): Promise<AttachedLegalFile> {
  if (!isSupportedLegalFile(file)) {
    throw new Error("Obsługuję pliki PDF, TXT, MD, RTF, CSV i LOG.");
  }

  if (file.size > maxLegalFileSize) {
    throw new Error("Maksymalny rozmiar załącznika to 12 MB.");
  }

  if (isPdf(file)) {
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const accessToken = sessionData.session?.access_token;
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/legal-opposition/parse-pdf", {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: formData,
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      text?: string;
    } | null;

    if (!response.ok || !data?.text) {
      throw new Error(data?.error ?? "Nie udało się odczytać PDF-a.");
    }

    return { name: file.name, text: data.text.slice(0, maxLegalTextLength) };
  }

  const text = (await file.text()).trim();
  if (!text) {
    throw new Error("Plik nie zawiera tekstu możliwego do analizy.");
  }

  return { name: file.name, text: text.slice(0, maxLegalTextLength) };
}

export function useLegalAttachment() {
  const [attachedFile, setAttachedFile] = useState<AttachedLegalFile | null>(null);
  const [fileError, setFileError] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function attachFile(file: File) {
    setFileError("");

    try {
      setAttachedFile(await readLegalFile(file));
    } catch (error) {
      setAttachedFile(null);
      setFileError(error instanceof Error ? error.message : "Nie udało się odczytać pliku.");
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      await attachFile(file);
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!Array.from(event.dataTransfer.items).some((item) => item.kind === "file")) {
      return;
    }

    event.preventDefault();
    setIsDraggingFile(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsDraggingFile(false);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDraggingFile(false);

    const file = Array.from(event.dataTransfer.files)[0];
    if (file) {
      await attachFile(file);
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function removeFile() {
    setAttachedFile(null);
    setFileError("");
  }

  return {
    attachedFile,
    fileError,
    fileInputRef,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileChange,
    isDraggingFile,
    openFilePicker,
    removeFile,
  };
}

export function HiddenLegalFileInput({
  fileInputRef,
  onChange,
}: {
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      accept=".pdf,.txt,.md,.rtf,.csv,.log,application/pdf,text/plain,text/markdown,application/rtf,text/csv"
      className="hidden-file-input"
      onChange={onChange}
      ref={fileInputRef}
      type="file"
    />
  );
}

export function LegalFileUploadButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label="Dodaj plik PDF lub TXT"
      className="icon-button"
      disabled={disabled}
      onClick={onClick}
      title="Dodaj plik PDF lub TXT"
      type="button"
    >
      📎
    </button>
  );
}

export function AttachedLegalFilePreview({
  file,
  onRemove,
}: {
  file: AttachedLegalFile | null;
  onRemove: () => void;
}) {
  if (!file) {
    return null;
  }

  return (
    <div className="legal-file-attachment-preview">
      <div>
        <strong>📄 {file.name}</strong>
        <span>Treść pliku zostanie dołączona do analizy.</span>
      </div>
      <button aria-label="Usuń załącznik" onClick={onRemove} type="button">
        ×
      </button>
    </div>
  );
}

export function LegalDropOverlay({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return <div className="drop-overlay">Upuść PDF lub TXT</div>;
}
