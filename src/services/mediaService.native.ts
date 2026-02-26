// Native version: uses expo-image-picker + expo-image-manipulator
import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '../lib/supabase';

interface PickAndUploadImagesOptions {
    bucket: 'product-media' | 'review-media';
    folder: string;
    maxImages?: number;
    resizeWidth?: number;
    compress?: number;
    targetBytes?: number;
    onProgress?: (progress: { completed: number; total: number }) => void;
}

const DEFAULT_TARGET_BYTES = 1_000_000;
const MIN_COMPRESS = 0.45;
const MIN_WIDTH = 640;
const MAX_OPTIMIZE_LOOPS = 6;

async function ensureGalleryPermission() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        throw new Error('Please allow gallery permission to upload images.');
    }
}

async function uploadWebP(uri: string, bucket: string, folder: string) {
    if (!supabase) {
        throw new Error('Media upload requires Supabase.');
    }

    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`;

    const { error } = await supabase.storage.from(bucket).upload(fileName, arrayBuffer, {
        contentType: 'image/webp',
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
        const info = await FileSystem.getInfoAsync(converted.uri);
        const size = info && 'size' in info ? Number((info as { size?: number }).size ?? 0) : 0;
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
        const url = await uploadWebP(optimizedUri, options.bucket, options.folder);
        uploaded.push(url);
        options.onProgress?.({ completed: index + 1, total: selectedAssets.length });
    }

    return uploaded;
}
