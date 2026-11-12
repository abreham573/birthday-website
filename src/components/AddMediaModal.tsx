import React, { useState } from 'react';
import { X, Upload, Link, Camera, Video, Trash2, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { MemoryItem } from '../types';

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: MemoryItem) => void;
  onAddMultiple?: (items: MemoryItem[]) => void;
}

interface SelectedFilePreview {
  url: string;
  name: string;
}

export const AddMediaModal: React.FC<AddMediaModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  onAddMultiple,
}) => {
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [sourceMode, setSourceMode] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [selectedRawFiles, setSelectedRawFiles] = useState<File[]>([]);
  const [selectedPreviews, setSelectedPreviews] = useState<SelectedFilePreview[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [date, setDate] = useState('Birthday Special');
  const [tag, setTag] = useState('Birthday Special');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    setSelectedRawFiles((prev) => [...prev, ...fileList]);

    const newPreviews: SelectedFilePreview[] = [];
    let processed = 0;

    fileList.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          newPreviews.push({
            url: reader.result,
            name: file.name,
          });
        }
        processed++;
        if (processed === fileList.length) {
          setSelectedPreviews((prev) => [...prev, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemovePreview = (index: number) => {
    setSelectedPreviews((prev) => prev.filter((_, i) => i !== index));
    setSelectedRawFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (sourceMode === 'upload') {
      if (selectedRawFiles.length === 0) {
        setError('Please select at least one photo or video of Tsi.');
        return;
      }

      setIsUploading(true);

      try {
        // Send multipart form data to server /api/upload
        const formData = new FormData();
        selectedRawFiles.forEach((file) => {
          formData.append('files', file);
        });
        formData.append('title', title.trim() || 'My Beautiful Tsi ❤️');
        formData.append('caption', caption.trim() || 'A cherished memory of my love, Tsi.');
        formData.append('date', date.trim() || 'Special Memory');
        formData.append('tag', tag.trim() || 'Birthday Special');
        formData.append('mediaType', mediaType);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Upload request failed');
        }

        const data = await response.json();
        if (data.success && Array.isArray(data.newItems) && data.newItems.length > 0) {
          if (onAddMultiple) {
            onAddMultiple(data.newItems);
          } else {
            data.newItems.forEach((item: MemoryItem) => onAdd(item));
          }
          handleReset();
          onClose();
          return;
        }
      } catch (uploadErr) {
        console.warn('Server upload failed, falling back to local base64:', uploadErr);
        // Fallback to local preview items
        const fallbackItems: MemoryItem[] = selectedPreviews.map((p, idx) => ({
          id: `custom-memory-${Date.now()}-${idx}`,
          type: mediaType,
          url: p.url,
          title: title.trim() ? `${title.trim()} (${idx + 1})` : `Tsi Memory #${idx + 1}`,
          caption: caption.trim() || 'A sweet moment with Tsi.',
          date: date.trim() || 'Special Memory',
          tag: tag.trim() || 'Birthday Special',
          aspectRatio: mediaType === 'video' ? '16:9' : '4:3',
          isCustom: true,
        }));

        if (onAddMultiple) {
          onAddMultiple(fallbackItems);
        } else {
          fallbackItems.forEach((it) => onAdd(it));
        }
        handleReset();
        onClose();
      } finally {
        setIsUploading(false);
      }
    } else {
      // URL mode
      if (!urlInput.trim()) {
        setError('Please enter a valid media link.');
        return;
      }

      const item: MemoryItem = {
        id: `custom-memory-${Date.now()}`,
        type: mediaType,
        url: urlInput.trim(),
        title: title.trim() || 'Beautiful Tsi ❤️',
        caption: caption.trim() || 'A cherished memory of my love.',
        date: date.trim() || 'Special Memory',
        tag: tag.trim() || 'Birthday Special',
        aspectRatio: mediaType === 'video' ? '16:9' : '4:3',
        isCustom: true,
      };

      try {
        await fetch('/api/memories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
      } catch {}

      onAdd(item);
      handleReset();
      onClose();
    }
  };

  const handleReset = () => {
    setUrlInput('');
    setSelectedRawFiles([]);
    setSelectedPreviews([]);
    setTitle('');
    setCaption('');
    setDate('Birthday Special');
    setTag('Birthday Special');
    setError(null);
    setIsUploading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="relative w-full max-w-lg bg-[#220309] border border-rose-500/30 rounded-3xl p-6 shadow-2xl text-rose-50 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isUploading}
          className="absolute top-5 right-5 p-2 rounded-full text-rose-300/70 hover:text-white hover:bg-rose-900/40 transition-colors disabled:opacity-50"
          aria-label="Close Modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Permanent Gallery Upload</span>
          </span>
          <h2 id="modal-title" className="font-serif-cormorant text-2xl sm:text-3xl font-bold text-white mt-1">
            Upload Photos of Tsi
          </h2>
          <p className="text-xs text-rose-300/80 mt-1 leading-relaxed">
            Photos loaded from your device will be saved directly into the website so she can see them on her phone when you share the link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Media Type Selector */}
          <div className="flex gap-2 p-1 bg-rose-950/60 rounded-xl border border-rose-500/20">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => {
                setMediaType('photo');
                setSelectedPreviews([]);
                setSelectedRawFiles([]);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
                mediaType === 'photo'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-300/70 hover:text-white'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Photos</span>
            </button>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => {
                setMediaType('video');
                setSelectedPreviews([]);
                setSelectedRawFiles([]);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
                mediaType === 'video'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-300/70 hover:text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Video Clips</span>
            </button>
          </div>

          {/* Source Selector: Upload file vs URL */}
          <div className="flex items-center justify-between text-xs text-rose-300/80 px-1">
            <span>Choose Source:</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => setSourceMode('upload')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  sourceMode === 'upload' ? 'bg-rose-900/60 text-white font-medium' : 'text-rose-400/60 hover:text-rose-200'
                }`}
              >
                Upload from Device
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => setSourceMode('url')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  sourceMode === 'url' ? 'bg-rose-900/60 text-white font-medium' : 'text-rose-400/60 hover:text-rose-200'
                }`}
              >
                Web URL
              </button>
            </div>
          </div>

          {/* Upload Input or URL Input */}
          {sourceMode === 'upload' ? (
            <div className="border-2 border-dashed border-rose-500/30 rounded-2xl p-4 text-center hover:border-rose-400/60 transition-colors bg-rose-950/30">
              {selectedPreviews.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1 text-xs text-rose-300">
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{selectedPreviews.length} {selectedPreviews.length === 1 ? 'file' : 'files'} selected</span>
                    </span>
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => {
                        setSelectedPreviews([]);
                        setSelectedRawFiles([]);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-200 underline"
                    >
                      Clear all
                    </button>
                  </div>

                  {/* Multi-thumbnail preview grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                    {selectedPreviews.map((preview, i) => (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-black/60 group border border-rose-500/20">
                        {mediaType === 'photo' ? (
                          <img
                            src={preview.url}
                            alt={`Preview ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={preview.url}
                            className="w-full h-full object-cover"
                          />
                        )}
                        <button
                          type="button"
                          disabled={isUploading}
                          onClick={() => handleRemovePreview(i)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/80 text-white hover:text-red-400 transition-colors"
                          title="Remove this photo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add more files trigger */}
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/40 text-xs text-rose-200 hover:text-white cursor-pointer transition-colors border border-rose-500/20">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Select more files</span>
                    <input
                      type="file"
                      multiple
                      accept={mediaType === 'photo' ? 'image/*' : 'video/*'}
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                </div>
              ) : (
                <label className="cursor-pointer block py-7">
                  <Upload className="w-10 h-10 mx-auto text-rose-400 mb-2 animate-bounce" />
                  <span className="text-sm font-semibold text-rose-200 block">
                    Tap to browse photos or videos of Tsi
                  </span>
                  <span className="text-[11px] text-rose-300/70 block mt-1">
                    Select multiple photos at once (JPG, PNG, WebP, MP4)
                  </span>
                  <input
                    type="file"
                    multiple
                    accept={mediaType === 'photo' ? 'image/*' : 'video/*'}
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-rose-300/80 mb-1">
                Direct {mediaType === 'photo' ? 'Image' : 'Video'} Link
              </label>
              <div className="relative">
                <input
                  type="url"
                  placeholder={mediaType === 'photo' ? 'https://example.com/tsi.jpg' : 'https://example.com/tsi.mp4'}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  disabled={isUploading}
                  className="w-full bg-rose-950/50 border border-rose-500/30 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-rose-400/40 focus:outline-none focus:border-rose-400"
                />
                <Link className="absolute right-3 top-3 w-4 h-4 text-rose-400/60" />
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-rose-300/80 mb-1">
              Title
            </label>
            <input
              type="text"
              placeholder="e.g. My Sunshine Tsi, Beautiful Laugh..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isUploading}
              className="w-full bg-rose-950/50 border border-rose-500/30 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-rose-400/40 focus:outline-none focus:border-rose-400"
            />
          </div>

          {/* Date & Tag Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-rose-300/80 mb-1">
                Date / Occasion
              </label>
              <input
                type="text"
                placeholder="e.g. Birthday Special, Summer"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isUploading}
                className="w-full bg-rose-950/50 border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white placeholder-rose-400/40 focus:outline-none focus:border-rose-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-rose-300/80 mb-1">
                Category
              </label>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                disabled={isUploading}
                className="w-full bg-[#1b0207] border border-rose-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-400"
              >
                <option value="Birthday Special">Birthday Special</option>
                <option value="Sweet Moments">Sweet Moments</option>
                <option value="Our Firsts">Our Firsts</option>
                <option value="Date Nights">Date Nights</option>
                <option value="Adventures">Adventures</option>
              </select>
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="block text-xs font-medium text-rose-300/80 mb-1">
              Sweet Note / Caption (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Write a sweet message about this moment..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={isUploading}
              className="w-full bg-rose-950/50 border border-rose-500/30 rounded-xl px-3.5 py-2 text-xs text-white placeholder-rose-400/40 focus:outline-none focus:border-rose-400 resize-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/30 rounded-lg p-2.5">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 text-xs font-medium text-rose-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-red-600 rounded-xl hover:from-rose-500 hover:to-red-500 shadow-lg shadow-rose-950/60 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-70 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving to website for her...</span>
                </>
              ) : selectedPreviews.length > 1 ? (
                <span>Save {selectedPreviews.length} Photos to Website</span>
              ) : (
                <span>Save to Website</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
