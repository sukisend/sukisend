import { Platform } from 'react-native';

interface PickAndUploadImagesOptions {
  bucket: 'product-media' | 'review-media';
  folder: string;
  maxImages?: number;
  resizeWidth?: number;
  compress?: number;
  targetBytes?: number;
  onProgress?: (progress: { completed: number; total: number }) => void;
}

export interface PickAndUploadChatMediaResult {
  url: string;
  type: 'image' | 'video';
  mimeType?: string;
  sizeBytes?: number;
}

interface PickAndUploadChatMediaOptions {
  folder: string;
  maxBytes?: number;
}

type PickAndUploadImages = (options: PickAndUploadImagesOptions) => Promise<string[]>;
type PickAndUploadChatMedia = (options: PickAndUploadChatMediaOptions) => Promise<PickAndUploadChatMediaResult | null>;

const mediaService =
  Platform.OS === 'web'
    ? (require('./mediaService.web') as { pickAndUploadImages: PickAndUploadImages; pickAndUploadChatMedia: PickAndUploadChatMedia })
    : (require('./mediaService.native') as { pickAndUploadImages: PickAndUploadImages; pickAndUploadChatMedia: PickAndUploadChatMedia });

export const pickAndUploadImages = mediaService.pickAndUploadImages;
export const pickAndUploadChatMedia = mediaService.pickAndUploadChatMedia;
