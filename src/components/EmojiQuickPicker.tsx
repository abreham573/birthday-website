import React from 'react';
import { Smile } from 'lucide-react';

const ROMANTIC_EMOJIS = [
  '❤️',
  '🥰',
  '😍',
  '😘',
  '🥹',
  '💖',
  '💕',
  '🫶',
  '🌹',
  '✨',
  '🎂',
  '🎉',
  '🥂',
  '📸',
  '💫',
  '🌸',
  '💐',
  '💌',
] as const;

interface EmojiQuickPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function insertTextAtCursor(
  element: HTMLTextAreaElement | HTMLInputElement | null,
  currentValue: string,
  textToInsert: string,
  maxLength = 1000
): { nextValue: string; nextCursorPos: number } {
  if (!element) {
    const appended = `${currentValue}${textToInsert}`.slice(0, maxLength);
    return { nextValue: appended, nextCursorPos: appended.length };
  }

  const start = element.selectionStart ?? currentValue.length;
  const end = element.selectionEnd ?? currentValue.length;
  const before = currentValue.slice(0, start);
  const after = currentValue.slice(end);
  const combined = `${before}${textToInsert}${after}`;

  if (combined.length <= maxLength) {
    return {
      nextValue: combined,
      nextCursorPos: start + textToInsert.length,
    };
  }

  const trimmed = combined.slice(0, maxLength);
  return {
    nextValue: trimmed,
    nextCursorPos: Math.min(start + textToInsert.length, trimmed.length),
  };
}

export const EmojiQuickPicker: React.FC<EmojiQuickPickerProps> = ({
  onSelect,
  disabled = false,
}) => {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center gap-1 text-[11px] text-rose-300/75 mr-1">
        <Smile className="w-3.5 h-3.5 text-rose-400" />
        <span>Add emoji:</span>
      </span>
      {ROMANTIC_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(emoji)}
          aria-label={`Insert ${emoji} emoji`}
          className="px-1.5 py-0.5 text-base leading-none rounded-lg bg-rose-950/60 hover:bg-rose-800/70 border border-rose-500/20 hover:border-rose-400/50 transition-transform active:scale-90 cursor-pointer disabled:opacity-50"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
