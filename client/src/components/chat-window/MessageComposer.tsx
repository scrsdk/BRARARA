import { Bold, Clock, Code, Italic, Link2, List, Mic, Paperclip, Send } from 'lucide-react';
import type { ChangeEvent, FormEvent, Ref } from 'react';
import { useState, useRef } from 'react';
import { ComposerLinkPreview } from '../ComposerLinkPreview';
import { EmojiInput } from '../EmojiInput';
import SelfDestructOptions from '../SelfDestructOptions';
import ru from '../../i18n/ru';

interface MessageComposerProps {
  messageInput: string;
  selfDestructSeconds: number | null;
  showSelfDestructOptions: boolean;
  selfDestructButtonRef: Ref<HTMLButtonElement>;
  fileInputRef: Ref<HTMLInputElement>;
  onSubmit: (event: FormEvent) => void;
  onTyping: (event: ChangeEvent<HTMLInputElement>) => void;
  onEmojiSelect: (emoji: string) => void;
  onVoiceRecorderOpen: () => void;
  onFileButtonClick: () => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleSelfDestructOptions: () => void;
  onSelfDestructSelect: (seconds: number | null) => void;
  onCloseSelfDestructOptions: () => void;
}

export function MessageComposer({
  messageInput,
  selfDestructSeconds,
  showSelfDestructOptions,
  selfDestructButtonRef,
  fileInputRef,
  onSubmit,
  onTyping,
  onEmojiSelect,
  onVoiceRecorderOpen,
  onFileButtonClick,
  onFileSelect,
  onToggleSelfDestructOptions,
  onSelfDestructSelect,
  onCloseSelfDestructOptions,
}: MessageComposerProps) {
  const [showFormatting, setShowFormatting] = useState(false);
  const [showLinkPreview, setShowLinkPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const insertFormatting = (before: string, after: string = '') => {
    const input = inputRef.current;
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const selectedText = messageInput.substring(start, end);
    const newText = messageInput.substring(0, start) + before + selectedText + after + messageInput.substring(end);
    
    // Update the input value through a synthetic event
    const event = {
      target: { value: newText },
    } as ChangeEvent<HTMLInputElement>;
    onTyping(event);
    
    // Check if URL is being added for link preview
    if (before === '[' && after === '](url)') {
      setShowLinkPreview(true);
    }
  };

  const handleBold = () => insertFormatting('**', '**');
  const handleItalic = () => insertFormatting('_', '_');
  const handleCode = () => insertFormatting('`', '`');
  const handleLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      insertFormatting(`[`, `](${url})`);
      setShowLinkPreview(true);
    }
  };
  const handleList = () => insertFormatting('\n- ', '');

  return (
    <form
      onSubmit={onSubmit}
      className="safe-pb border-t border-white/8 bg-[linear-gradient(180deg,rgba(18,28,40,0.9),rgba(15,24,35,0.96))] px-2 py-2 md:px-4 md:py-3"
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileSelect}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
      />
      
      {/* Formatting toolbar */}
      {showFormatting && (
        <div className="mb-2 flex items-center gap-1 rounded-lg bg-slate-800/80 p-1.5 backdrop-blur">
          <button
            type="button"
            onClick={handleBold}
            className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleItalic}
            className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleCode}
            className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="Code"
          >
            <Code className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLink}
            className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="Link"
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleList}
            className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            title="List"
          >
            <List className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-white/10" />
          <button
            type="button"
            onClick={() => setShowFormatting(false)}
            className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 md:gap-2">
        <button
          type="button"
          onClick={() => setShowFormatting(!showFormatting)}
          className={`panel-soft flex-shrink-0 rounded-full p-1.5 text-[#9cb4ca] transition hover:bg-white/10 md:p-2 ${
            showFormatting ? 'bg-white/10 text-white' : ''
          }`}
          title="Formatting"
        >
          <Bold className="h-4 w-4 md:h-5 md:w-5" />
        </button>

        <button
          type="button"
          onClick={onVoiceRecorderOpen}
          className="panel-soft flex-shrink-0 rounded-full p-1.5 text-[#9cb4ca] transition hover:bg-white/10 md:p-2"
          title={ru.chat.messages.voiceTitle}
        >
          <Mic className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onFileButtonClick}
          className="panel-soft flex-shrink-0 rounded-full p-1.5 text-[#9cb4ca] transition hover:bg-white/10 md:p-2"
          title={ru.chat.messages.attachTitle}
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <div className="relative hidden md:block">
          <button
            ref={selfDestructButtonRef}
            type="button"
            onClick={onToggleSelfDestructOptions}
            className={`panel-soft rounded-full p-2 text-[#9cb4ca] transition hover:bg-white/10 ${
              selfDestructSeconds ? 'bg-[#4ba3ff]/18 text-[#8cc6ff] ring-1 ring-[#4ba3ff]/30' : ''
            }`}
            title={ru.chat.messages.selfDestructTitle}
          >
            <Clock className="h-5 w-5" />
          </button>
          {showSelfDestructOptions && (
            <SelfDestructOptions onSelect={onSelfDestructSelect} onClose={onCloseSelfDestructOptions} />
          )}
        </div>

        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={messageInput}
            onChange={onTyping}
            placeholder={ru.chat.messages.placeholder}
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-[15px] text-white placeholder-[#8ba4bc] shadow-inner shadow-black/10 focus:outline-none md:px-4 md:py-3"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSubmit(event);
              }
              // Keyboard shortcuts for formatting
              if (event.ctrlKey || event.metaKey) {
                if (event.key === 'b') {
                  event.preventDefault();
                  handleBold();
                } else if (event.key === 'i') {
                  event.preventDefault();
                  handleItalic();
                }
              }
            }}
          />
          
          {/* Link preview while typing */}
          {showLinkPreview && messageInput.includes('http') && (
            <ComposerLinkPreview 
              text={messageInput} 
              onRemove={() => setShowLinkPreview(false)} 
            />
          )}
        </div>

        <EmojiInput onEmojiSelect={onEmojiSelect} />

        <button
          type="submit"
          className="flex-shrink-0 rounded-full bg-[linear-gradient(135deg,#4ba3ff,#2f8cff)] p-1.5 text-white shadow-[0_12px_30px_rgba(47,140,255,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 md:p-2.5"
          disabled={!messageInput.trim()}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}