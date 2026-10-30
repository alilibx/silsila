type Props = {
  checked: boolean;
  onToggle: () => void;
  /** The id of the element that names the switch, or else `label`. */
  labelledBy?: string;
  label?: string;
};

/** The «يمكنه إنشاء ختمة بالتناوب» switch. It only asks: the caller confirms and saves. */
export function RotaSwitch({ checked, onToggle, labelledBy, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
        checked ? "bg-green" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-1 size-6 rounded-full bg-white transition-all ${
          checked ? "start-7" : "start-1"
        }`}
      />
    </button>
  );
}
