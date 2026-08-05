import { useId, useState } from "react";
import Icon from "./Icon";

/**
 * A password field with a show/hide toggle.
 *
 * Every password input in the app was type="password" with no way to reveal it —
 * including the reset flow, which is used by someone already locked out, and the
 * three-field change-password form where a single typo in a blind-typed field
 * just fails an equality check with no explanation.
 *
 * The toggle is a real <button> with an aria-label and aria-pressed, because
 * Icon renders aria-hidden and would otherwise leave it unnamed. type="button"
 * matters: inside a <form> a bare button defaults to submit, so revealing the
 * password would submit the form.
 */
export default function PasswordInput({
  value,
  onChange,
  autoComplete,
  placeholder,
  id,
  disabled,
  onKeyDown,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const generated = useId();
  const inputId = id || generated;
  return (
    <div className="input-wrap">
      <input
        id={inputId}
        type={shown ? "text" : "password"}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="input-affix"
        onClick={() => setShown((s) => !s)}
        disabled={disabled}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        <Icon name={shown ? "visibility_off" : "visibility"} size={18} />
      </button>
    </div>
  );
}
