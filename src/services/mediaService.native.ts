// Native version: uses expo-image-picker + expo-image-manipulator
import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '../lib/supabase';
import type { PickAndUploadChatMediaResult } from './mediaService';

interface PickAndUploadImagesOptions {
  bucket: 'product-media' | 'review-media' | 'profile-media' | 'banner-media';
  folder: string;
  maxImages?: number;
  resizeWidth?: number;
  compress?: number;
  targetBytes?: number;
  onProgress?: (progress: { completed: number; total: number }) => void;
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

const DEFAULT_TARGET_BYTES = 1_000_000;
const MIN_COMPRESS = 0.45;
const MIN_WIDTH = 640;
const MAX_OPTIMIZE_LOOPS = 6;
const CHAT_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_MAX_WIDTH = 1920;
const CHAT_MIN_WIDTH = 900;
const CHAT_MIN_QUALITY = 0.78;

async function ensureGalleryPermission() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Please allow gallery permission to upload media.');
  }
}

function extensionFromMimeType(mimeType: string | undefined, fallback = 'bin') {
  const normalized = (mimeType ?? '').toLowerCase();
  if (normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('quicktime')) return 'mov';
  if (normalized.includes('webm')) return 'webm';
  return fallback;
}

async function getFileSize(uri: string, fallbackSize?: number) {
  if (Number.isFinite(fallbackSize) && Number(fallbackSize) > 0) {
    return Number(fallbackSize);
  }

  const info = await FileSystem.getInfoAsync(uri);
  if (info && 'size' in info) {
    return Number((info as { size?: number }).size ?? 0);
  }

  return 0;
}

async function uploadFileUri(uri: string, bucket: string, folder: string, contentType: string, extension: string) {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(fileName, arrayBuffer, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return data.publicUrl;
}

async function optimizeImageUri(
  asset: ImagePicker.ImagePickerAsset,
  resizeWidth: number,
  compress: number,
  targetBytes: number,
) {
  const baseWidth = Math.min(resizeWidth, asset.width ?? resizeWidth);
  let currentWidth = Math.max(MIN_WIDTH, baseWidth);
  let currentCompress = Math.min(1, Math.max(MIN_COMPRESS, compress));
  let lastUri = asset.uri;

  for (let attempt = 0; attempt < MAX_OPTIMIZE_LOOPS; attempt += 1) {
    const converted = await manipulateAsync(
      asset.uri,
      [{ resize: { width: Math.round(currentWidth) } }],
      {
        compress: currentCompress,
        format: SaveFormat.WEBP,
      },
    );

    lastUri = converted.uri;
    const size = await getFileSize(converted.uri);
    if (!size || size <= targetBytes) {
      return converted.uri;
    }

    if (currentCompress > MIN_COMPRESS + 0.05) {
      currentCompress = Math.max(MIN_COMPRESS, Number((currentCompress - 0.1).toFixed(2)));
    } else {
      currentWidth = Math.max(MIN_WIDTH, Math.round(currentWidth * 0.86));
    }
  }

  return lastUri;
}

async function optimizeChatImageUri(asset: ImagePicker.ImagePickerAsset, maxBytes: number) {
  const sourceWidth = asset.width ?? CHAT_MAX_WIDTH;
  let currentWidth = Math.min(CHAT_MAX_WIDTH, sourceWidth);
  let currentQuality = 0.92;
  let lastUri = asset.uri;
  let lastSize = await getFileSize(asset.uri, asset.fileSize);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const actions = sourceWidth > currentWidth ? [{ resize: { width: Math.round(currentWidth) } }] : [];
    const converted = await manipulateAsync(asset.uri, actions, {
      compress: currentQuality,
      format: SaveFormat.WEBP,
    });

    lastUri = converted.uri;
    lastSize = await getFileSize(converted.uri);
    if (lastSize <= maxBytes) {
      return { uri: converted.uri, sizeBytes: lastSize };
    }

    if (currentQuality > CHAT_MIN_QUALITY + 0.03) {
      currentQuality = Number((currentQuality - 0.04).toFixed(2));
    } else {
      currentWidth = Math.max(CHAT_MIN_WIDTH, Math.round(currentWidth * 0.9));
    }
  }

  return { uri: lastUri, sizeBytes: lastSize };
}

export async function pickAndUploadImages(options: PickAndUploadImagesOptions): Promise<string[]> {
  const maxImages = options.maxImages ?? 5;
  const compress = options.compress ?? 0.75;
  const resizeWidth = options.resizeWidth ?? 1400;
  const targetBytes = options.targetBytes ?? DEFAULT_TARGET_BYTES;

  await ensureGalleryPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: maxImages,
    quality: 1,
  });

  if (result.canceled) {
    return [];
  }

  const selectedAssets = result.assets.slice(0, maxImages);
  const uploaded: string[] = [];
  options.onProgress?.({ completed: 0, total: selectedAssets.length });

  for (const [index, asset] of selectedAssets.entries()) {
    const optimizedUri = await optimizeImageUri(asset, resizeWidth, compress, targetBytes);
    const url = await uploadFileUri(optimizedUri, options.bucket, options.folder, 'image/webp', 'webp');
    uploaded.push(url);
    options.onProgress?.({ completed: index + 1, total: selectedAssets.length });
  }

  return uploaded;
}

export async function pickAndUploadChatMedia(
  options: PickAndUploadChatMediaOptions,
): Promise<PickAndUploadChatMediaResult | null> {
  const maxBytes = options.maxBytes ?? CHAT_MAX_BYTES;

  await ensureGalleryPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    allowsMultipleSelection: false,
    quality: 1,
  });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  const asset = result.assets[0];
  const kind = asset.type === 'video' ? 'video' : 'image';

  if (kind === 'video') {
    const sizeBytes = await getFileSize(asset.uri, asset.fileSize);
    if (sizeBytes > maxBytes) {
      throw new Error('Video is too large. Maximum allowed size is 10MB.');
    }

    const mimeType = asset.mimeType ?? 'video/mp4';
    const extension = extensionFromMimeType(mimeType, 'mp4');
    const url = await uploadFileUri(asset.uri, 'chat-media', options.folder, mimeType, extension);
    return {
      url,
      type: 'video',
      mimeType,
      sizeBytes,
    };
  }

  const optimized = await optimizeChatImageUri(asset, maxBytes);
  if (optimized.sizeBytes > maxBytes) {
    throw new Error('Image is too large. Maximum allowed size is 10MB.');
  }

  const url = await uploadFileUri(optimized.uri, 'chat-media', options.folder, 'image/webp', 'webp');
  return {
    url,
    type: 'image',
    mimeType: 'image/webp',
    sizeBytes: optimized.sizeBytes,
  };
}

export async function pickAndUploadAvatar(options: PickAndUploadAvatarOptions): Promise<string | null> {
  const compress = options.compress ?? 0.8;
  const resizeWidth = options.resizeWidth ?? 500;
  const targetBytes = options.targetBytes ?? 2_000_000;

  await ensureGalleryPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: false,
    quality: 1,
    aspect: [1, 1],
    allowsEditing: true,
  });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  const asset = result.assets[0];
  const optimizedUri = await optimizeImageUri(asset, resizeWidth, compress, targetBytes);
  return uploadFileUri(optimizedUri, 'profile-media', options.folder, 'image/webp', 'webp');
}
