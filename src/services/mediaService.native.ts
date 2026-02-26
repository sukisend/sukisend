// Native version: uses expo-image-picker + expo-image-manipulator
import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

import { supabase } from '../lib/supabase';

interface PickAndUploadImagesOptions {
    bucket: 'product-media' | 'review-media';
    folder: string;
    maxImages?: number;
    resizeWidth?: number;
    compress?: number;
}

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

export async function pickAndUploadImages(options: PickAndUploadImagesOptions): Promise<string[]> {
    const maxImages = options.maxImages ?? 5;
    const compress = options.compress ?? 0.75;
    const resizeWidth = options.resizeWidth ?? 1400;

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

    for (const asset of selectedAssets) {
        const converted = await manipulateAsync(
            asset.uri,
            [{ resize: { width: resizeWidth } }],
            {
                compress,
                format: SaveFormat.WEBP,
            },
        );

        const url = await uploadWebP(converted.uri, options.bucket, options.folder);
        uploaded.push(url);
    }

    return uploaded;
}
