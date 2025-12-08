import { useEffect, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";

const QUICK_EMOJIS = ['🎁','🍦','🛌','🎮','🎬','🍕','💵','🧸','🧹','📱'];

type Props = {
  value?: string;
  onChange: (emoji: string) => void;
  disabled?: boolean;
};

export function RewardIconPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-2">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            disabled={disabled}
            onClick={() => onChange(e)}
            className={`h-9 w-9 rounded-lg border flex items-center justify-center text-xl transition
              ${value === e ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white"}
              ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-300"}`}
            aria-label={`Select ${e}`}
            title={e}
          >
            {e}
          </button>
        ))}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium hover:border-indigo-300"
        >
          More…
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-2">
          <EmojiPicker
            open={open}
            onEmojiClick={(emojiData) => {
              onChange(emojiData.emoji);
              setOpen(false);
            }}
            width={350}
            height={420}
            theme="light"
            emojiStyle="native"
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}
    </div>
  );
}
