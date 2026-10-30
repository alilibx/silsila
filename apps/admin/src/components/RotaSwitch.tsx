import { Switch } from "@/components/ui/switch";

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
    <Switch
      checked={checked}
      onCheckedChange={onToggle}
      aria-labelledby={labelledBy}
      aria-label={label}
    />
  );
}
