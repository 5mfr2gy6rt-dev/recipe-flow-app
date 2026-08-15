"use client";

import { useRef, useState } from "react";

type Mode = "url" | "photo" | "text";

export interface ExtractRequest {
  mode: Mode;
  url?: string;
  text?: string;
  image?: { data: string; media_type: string };
}

interface Props {
  busy: boolean;
  onSubmit: (req: ExtractRequest) => void;
}

function fileToBase64(file: File): Promise<{ data: string; media_type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve({
        data: result.slice(result.indexOf(",") + 1),
        media_type: file.type || "image/jpeg",
      });
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

export default function InputPanel({ busy, onSubmit }: Props) {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ data: string; media_type: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function takeFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const encoded = await fileToBase64(file);
    setImage(encoded);
    setPreview(URL.createObjectURL(file));
  }

  function submit() {
    if (busy) return;
    if (mode === "url" && url.trim()) onSubmit({ mode: "url", url: url.trim() });
    else if (mode === "text" && text.trim())
      onSubmit({ mode: "text", text: text.trim() });
    else if (mode === "photo" && image) onSubmit({ mode: "photo", image });
  }

  const canSubmit =
    (mode === "url" && url.trim().length > 0) ||
    (mode === "text" && text.trim().length > 0) ||
    (mode === "photo" && image !== null);

  return (
    <div className="panel">
      <div className="tabs" role="tablist">
        {(["url", "photo", "text"] as Mode[]).map((m) => (
          <button
            type="button"
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "tab on" : "tab"}
            onClick={() => setMode(m)}
          >
            {m === "url" ? "Paste a link" : m === "photo" ? "Photo" : "Paste text"}
          </button>
        ))}
      </div>

      {mode === "url" && (
        <input
          className="big"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      )}

      {mode === "text" && (
        <textarea
          className="big"
          rows={9}
          placeholder="Paste the ingredients and instructions…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}

      {mode === "photo" && (
        <div
          className={`drop${dragging ? " dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void takeFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected recipe" className="preview" />
          ) : (
            <p>
              Drop a photo here, or tap to take one.
              <br />
              <span className="dim">
                Typed, printed or handwritten all work.
              </span>
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void takeFile(e.target.files?.[0])}
          />
        </div>
      )}

      <button
        type="button"
        className="primary"
        onClick={submit}
        disabled={busy || !canSubmit}
      >
        {busy ? "Reading the recipe…" : "Make the diagram"}
      </button>

      <style jsx>{`
        .panel {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .tabs {
          display: flex;
          gap: 6px;
        }
        .tab {
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          padding: 7px 14px;
          border-radius: 999px;
          border: 1px solid #dcd8c8;
          background: #fff;
          color: #56554f;
          cursor: pointer;
        }
        .tab.on {
          background: #2f7d4f;
          border-color: #2f7d4f;
          color: #fff;
        }
        .big {
          font: inherit;
          font-size: 15px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid #d8d4c4;
          background: #fff;
          width: 100%;
          resize: vertical;
        }
        .drop {
          border: 2px dashed #cfcab6;
          border-radius: 12px;
          padding: 26px 16px;
          text-align: center;
          cursor: pointer;
          background: #fffdf4;
          color: #56554f;
          font-size: 14px;
          line-height: 1.6;
        }
        .drop.dragging {
          border-color: #2f7d4f;
          background: #f4faf5;
        }
        .dim {
          color: #8a8880;
          font-size: 13px;
        }
        .preview {
          max-height: 240px;
          max-width: 100%;
          border-radius: 8px;
        }
        .primary {
          font: inherit;
          font-size: 15px;
          font-weight: 600;
          padding: 12px 20px;
          border-radius: 999px;
          border: none;
          background: #2f7d4f;
          color: #fff;
          cursor: pointer;
          align-self: flex-start;
        }
        .primary:disabled {
          opacity: 0.5;
          cursor: default;
        }
      `}</style>
    </div>
  );
}
