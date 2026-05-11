import { useEffect, useState, useMemo } from 'react';
import { Link2, X } from 'lucide-react';

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

interface ComposerLinkPreviewProps {
  text: string;
  onRemove?: () => void;
}

// Simple URL regex pattern
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function ComposerLinkPreview({ text, onRemove }: ComposerLinkPreviewProps) {
  const [previewData, setPreviewData] = useState<LinkPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Extract URL from text
  const url = useMemo(() => {
    const matches = text.match(URL_REGEX);
    return matches ? matches[0] : null;
  }, [text]);

  // Fetch link preview when URL is detected
  useEffect(() => {
    if (!url) {
      setPreviewData(null);
      return;
    }

    // Simple client-side preview - in production, you'd call your backend API
    const fetchPreview = async () => {
      setIsLoading(true);
      try {
        // Create a simple preview based on the URL
        const urlObj = new URL(url);
        const preview: LinkPreviewData = {
          url: url,
          title: urlObj.hostname,
          description: url,
          siteName: urlObj.hostname.replace('www.', ''),
        };

        // Try to fetch the page to extract Open Graph metadata
        try {
          const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.title || data.description || data.image) {
              setPreviewData(data);
              return;
            }
          }
        } catch {
          // Ignore fetch errors, use fallback preview
        }

        // Fallback to basic preview
        setPreviewData(preview);
      } catch (error) {
        console.error('Error generating link preview:', error);
        setPreviewData(null);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce the fetch
    const timeoutId = setTimeout(fetchPreview, 500);
    return () => clearTimeout(timeoutId);
  }, [url]);

  if (!url || isLoading) {
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-white/10 bg-slate-800/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link2 className="h-3.5 w-3.5" />
          <span>Link Preview</span>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      
      <div className="flex gap-3">
        {previewData?.image && (
          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-slate-700">
            <img
              src={previewData.image}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {previewData?.title && (
            <p className="truncate text-sm font-medium text-white">{previewData.title}</p>
          )}
          {previewData?.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{previewData.description}</p>
          )}
          {!previewData?.title && !previewData?.description && (
            <p className="truncate text-sm text-blue-400">{url}</p>
          )}
        </div>
      </div>
    </div>
  );
}