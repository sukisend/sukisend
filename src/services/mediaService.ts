import { Platform } from 'react-native';

interface PickAndUploadImagesOptions {
  bucket: 'product-media' | 'review-media' | 'profile-media' | 'banner-media';
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

interface PickAndUploadAvatarOptions {
  folder: string;
  resizeWidth?: number;
  compress?: number;
  targetBytes?: number;
}

type PickAndUploadImages = (options: PickAndUploadImagesOptions) => Promise<string[]>;
type PickAndUploadChatMedia = (options: PickAndUploadChatMediaOptions) => Promise<PickAndUploadChatMediaResult | null>;
type PickAndUploadAvatar = (options: PickAndUploadAvatarOptions) => Promise<string | null>;

const mediaService =
  Platform.OS === 'web'
    ? (require('./mediaService.web') as { pickAndUploadImages: PickAndUploadImages; pickAndUploadChatMedia: PickAndUploadChatMedia; pickAndUploadAvatar: PickAndUploadAvatar })
    : (require('./mediaService.native') as { pickAndUploadImages: PickAndUploadImages; pickAndUploadChatMedia: PickAndUploadChatMedia; pickAndUploadAvatar: PickAndUploadAvatar });

export const pickAndUploadImages = mediaService.pickAndUploadImages;
export const pickAndUploadChatMedia = mediaService.pickAndUploadChatMedia;
export const pickAndUploadAvatar = mediaService.pickAndUploadAvatar;
