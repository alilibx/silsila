import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { t } from "../i18n/ar";

/** A labelled switch with its state written beside it, as well as announced. */
export function SwitchLine({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  const labelId = useId();
  return (
    <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
      <span id={labelId}>{label}</span>
      <span className="flex items-center gap-2 text-muted-foreground">
        {on ? t.settings.on : t.settings.off}
        <Switch
          aria-labelledby={labelId}
          checked={on}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      </span>
    </div>
  );
}
