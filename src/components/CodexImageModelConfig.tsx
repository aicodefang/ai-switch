import { useEffect, useId, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SingleSelectDropdown } from "./SingleSelectDropdown";
import "./CodexLocalAccessModal.css";

const PRESETS = ["gpt-image-2.5", "gpt-image-2"];
const CUSTOM = "__custom__";
const keyPrefix = "codex.localAccess.imageGenerationModel";

interface Props {
  model?: string;
  disabled: boolean;
  onSave: (model: string) => Promise<unknown> | unknown;
}

// API Service collection setting; shared by the service page and account dialog.
// General Codex client settings do not own this gateway's image endpoint model.
export function CodexImageModelConfig({ model, disabled, onSave }: Props) {
  const { t } = useTranslation();
  const initialModel = model?.trim() || PRESETS[0];
  const [selection, setSelection] = useState(PRESETS.includes(initialModel) ? initialModel : CUSTOM);
  const [customModel, setCustomModel] = useState(PRESETS.includes(initialModel) ? "" : initialModel);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const feedbackId = useId();
  const busy = disabled || pending;

  useEffect(() => {
    setSelection(PRESETS.includes(initialModel) ? initialModel : CUSTOM);
    setCustomModel(PRESETS.includes(initialModel) ? "" : initialModel);
  }, [initialModel]);

  useEffect(() => {
    if (!error) return;
    feedbackRef.current?.scrollIntoView({ block: "nearest" });
    if (fieldError) inputRef.current?.focus();
  }, [error, fieldError]);

  const clearFeedback = () => {
    setError("");
    setFieldError(false);
    setNotice("");
  };

  const save = async () => {
    if (busy || savingRef.current) return;
    clearFeedback();
    const nextModel = (selection === CUSTOM ? customModel : selection).trim();
    if (!nextModel) {
      setFieldError(true);
      setError(t(`${keyPrefix}.required`));
      return;
    }
    savingRef.current = true;
    setPending(true);
    try {
      await onSave(nextModel);
      setNotice(t(`${keyPrefix}.saveSuccess`));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const isFieldError = message === `${keyPrefix}.required` || message === `${keyPrefix}.tooLong`;
      setFieldError(isFieldError);
      setError(isFieldError ? t(message) : message);
    } finally {
      savingRef.current = false;
      setPending(false);
    }
  };

  return (
    <div className="codex-local-access-config-card codex-local-access-config-card-image-model">
      <div className="codex-local-access-config-head">
        <span className="codex-local-access-config-label">{t(`${keyPrefix}.label`)}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void save()} disabled={busy}>
          {pending && <RefreshCw size={14} className="loading-spinner" />}
          {t(`${keyPrefix}.save`)}
        </button>
      </div>
      <SingleSelectDropdown
        value={selection}
        options={[
          ...PRESETS.map((value) => ({ value, label: value })),
          { value: CUSTOM, label: t(`${keyPrefix}.custom`) },
        ]}
        onChange={(value) => {
          setSelection(value);
          clearFeedback();
        }}
        disabled={busy}
        ariaLabel={t(`${keyPrefix}.label`)}
        menuPlacement="up"
      />
      {selection === CUSTOM && (
        <input
          ref={inputRef}
          className="codex-local-access-image-model-input"
          type="text"
          value={customModel}
          aria-label={t(`${keyPrefix}.placeholder`)}
          aria-invalid={fieldError}
          aria-describedby={feedbackId}
          onChange={(event) => {
            setCustomModel(event.target.value);
            clearFeedback();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void save();
            }
          }}
          maxLength={200}
          placeholder={t(`${keyPrefix}.placeholder`)}
          disabled={busy}
        />
      )}
      <div ref={feedbackRef} id={feedbackId}>
        {error && <small role="alert" className="codex-local-access-image-model-error">{error}</small>}
        {notice && <small role="status" className="codex-local-access-config-hint">{notice}</small>}
      </div>
      <small className="codex-local-access-config-hint">{t(`${keyPrefix}.description`)}</small>
    </div>
  );
}
