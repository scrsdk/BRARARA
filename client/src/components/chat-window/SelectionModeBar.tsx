import { motion, AnimatePresence } from 'framer-motion';
import { Forward, Trash2, X } from 'lucide-react';
import ru from '../../i18n/ru';

interface SelectionModeBarProps {
  selectedCount: number;
  onForward: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export function SelectionModeBar({
  selectedCount,
  onForward,
  onDelete,
  onCancel,
}: SelectionModeBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-[#008069] px-4 py-3 shadow-lg"
        >
          <button
            onClick={onCancel}
            className="flex items-center gap-2 text-white/90 transition hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>

          <span className="font-medium text-white">
            {ru.chat.selection.title} {selectedCount} {ru.chat.selection.messages}
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={onForward}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/10"
            >
              <Forward className="h-4 w-4" />
              {ru.chat.selection.forward}
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/10"
            >
              <Trash2 className="h-4 w-4" />
              {ru.chat.selection.delete}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}