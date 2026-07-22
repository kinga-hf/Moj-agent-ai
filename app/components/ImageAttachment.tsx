"use client";

import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  MutableRefObject,
  useRef,
  useState,
} from "react";

const allowedImageTypes = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];
const maxImageSize = 4 * 1024 * 1024;

export type AttachedImage = {
  dataUrl: string;
  name: string;
};

type UseImageAttachmentOptions = {
  onImage?: (image: AttachedImage) => void;
};

function isAllowedImage(file: File) {
  return allowedImageTypes.includes(file.type.toLowerCase());
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Nie udało się odczytać obrazu."));
      }
    };
    reader.onerror = () => reject(new Error("Nie udało się odczytać obrazu."));
    reader.readAsDataURL(file);
  });
}

export function useImageAttachment(options: UseImageAttachmentOptions = {}) {
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [imageError, setImageError] = useState("");
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function attachFile(file: File, fallbackName = "Screenshot") {
    setImageError("");

    if (!isAllowedImage(file)) {
      setImageError("Obsługuję PNG, JPG, JPEG, GIF i WEBP.");
      return;
    }

    if (file.size > maxImageSize) {
      setImageError("Max 4MB. Zrób screenshot fragmentu.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const image = {
        dataUrl,
        name: file.name || fallbackName,
      };

      setAttachedImage(image);
      options.onImage?.(image);
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "Nie udało się odczytać obrazu.",
      );
    }
  }

  async function handlePaste(event: ClipboardEvent<HTMLElement>) {
    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();

    if (!file) {
      return;
    }

    event.preventDefault();
    await attachFile(file, "Screenshot");
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      await attachFile(file);
    }

    event.target.value = "";
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function removeImage() {
    setAttachedImage(null);
    setImageError("");
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    const hasFile = Array.from(event.dataTransfer.items).some(
      (item) => item.kind === "file",
    );

    if (!hasFile) {
      return;
    }

    event.preventDefault();
    setIsDraggingImage(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsDraggingImage(false);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDraggingImage(false);

    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.type.startsWith("image/"),
    );

    if (file) {
      await attachFile(file);
    }
  }

  return {
    attachedImage,
    fileInputRef,
    imageError,
    isDraggingImage,
    attachFile,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileChange,
    handlePaste,
    openFilePicker,
    removeImage,
    setAttachedImage,
    setImageError,
  };
}

export function HiddenImageInput({
  fileInputRef,
  onChange,
}: {
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
      className="hidden-file-input"
      onChange={onChange}
      ref={fileInputRef}
      type="file"
    />
  );
}

export function ImageUploadButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label="Dodaj obraz"
      className="icon-button"
      disabled={disabled}
      onClick={onClick}
      title="Dodaj obraz"
      type="button"
    >
      📎
    </button>
  );
}

export function AttachedImagePreview({
  image,
  onRemove,
}: {
  image: AttachedImage | null;
  onRemove: () => void;
}) {
  if (!image) {
    return null;
  }

  return (
    <div className="image-attachment-preview">
      <img alt={image.name} src={image.dataUrl} />
      <div>
        <strong>📎 Screenshot</strong>
        <span>zadaj pytanie o ten obraz</span>
      </div>
      <button aria-label="Usuń obraz" onClick={onRemove} type="button">
        ×
      </button>
    </div>
  );
}

export function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return <div className="drop-overlay">Upuść obraz</div>;
}
