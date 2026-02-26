import { Platform } from 'react-native';

interface PickAndUploadImagesOptions {
  bucket: 'product-media' | 'review-media';
  folder: string;
  maxImages?: number;
  resizeWidth?: number;
  compress?: number;
}

type PickAndUploadImages = (options: PickAndUploadImagesOptions) => Promise<string[]>;

const mediaService =
  Platform.OS === 'web'
    ? (require('./mediaService.web') as { pickAndUploadImages: PickAndUploadImages })
    : (require('./mediaService.native') as { pickAndUploadImages: PickAndUploadImages });

export const pickAndUploadImages = mediaService.pickAndUploadImages;
