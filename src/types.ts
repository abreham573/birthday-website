export type TabType = 'memories' | 'letter' | 'song';

export interface MemoryItem {
  id: string;
  type: 'photo' | 'video';
  url: string;
  thumbnailUrl?: string;
  title: string;
  caption: string;
  date: string;
  tag: string;
  aspectRatio?: '4:3' | '16:9' | '1:1' | '9:16';
  isCustom?: boolean;
}

export interface LoveLetterData {
  recipient: string;
  salutation: string;
  notice?: string;
  paragraphs: string[];
  closing: string;
  signature: string;
  anniversaryDate?: string;
}
