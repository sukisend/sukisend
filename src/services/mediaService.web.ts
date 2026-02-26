// Web version: uses browser <input type="file"> + canvas resizing
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
const MIN_QUALITY = 0.45;
const MIN_WIDTH = 640;
const MAX_OPTIMIZE_LOOPS = 6;

async function uploadBlob(blob: Blob, bucket: string, folder: string) {
    if (!supabase) {
        throw new Error('Media upload requires Supabase.');
    }

    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`;

    const { error } = await supabase.storage.from(bucket).upload(fileName, blob, {
        contentType: 'image/webp',
        upsert: true,
    });
    if (error) {
        throw new Error(error.message);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
}

function canvasToWebPBlob(canvas: HTMLCanvasElement, quality: number) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error('Unable to encode image as WebP.'));
                    return;
                }
                resolve(blob);
            },
            'image/webp',
            quality,
        );
    });
}

async function optimizeFileToWebPBlob(file: File, resizeWidth: number, compress: number, targetBytes: number) {
    const bitmap = await createImageBitmap(file);
    const widthLimit = Math.min(resizeWidth, bitmap.width);
    let currentWidth = Math.max(MIN_WIDTH, widthLimit);
    let currentQuality = Math.min(1, Math.max(MIN_QUALITY, compress));
    let bestBlob: Blob | null = null;

    for (let attempt = 0; attempt < MAX_OPTIMIZE_LOOPS; attempt += 1) {
        const scale = Math.min(1, currentWidth / bitmap.width);
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Image processing context unavailable.');
        }
        ctx.drawImage(bitmap, 0, 0, width, height);

        const blob = await canvasToWebPBlob(canvas, currentQuality);
        bestBlob = blob;
        if (blob.size <= targetBytes) {
            break;
        }

        if (currentQuality > MIN_QUALITY + 0.05) {
            currentQuality = Math.max(MIN_QUALITY, Number((currentQuality - 0.1).toFixed(2)));
        } else {
            currentWidth = Math.max(MIN_WIDTH, Math.round(currentWidth * 0.86));
        }
    }

    bitmap.close();
    return bestBlob ?? file;
}

export async function pickAndUploadImages(options: PickAndUploadImagesOptions): Promise<string[]> {
    const maxImages = options.maxImages ?? 5;
    const resizeWidth = options.resizeWidth ?? 1400;
    const compress = options.compress ?? 0.75;
    const targetBytes = options.targetBytes ?? DEFAULT_TARGET_BYTES;

    return new Promise<string[]>((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = maxImages > 1;

        input.onchange = async () => {
            try {
                const files = Array.from(input.files ?? []).slice(0, maxImages);
                if (!files.length) {
                    resolve([]);
                    return;
                }

                const uploaded: string[] = [];
                options.onProgress?.({ completed: 0, total: files.length });

                for (const [index, file] of files.entries()) {
                    const blob = await optimizeFileToWebPBlob(file, resizeWidth, compress, targetBytes);
                    const url = await uploadBlob(blob, options.bucket, options.folder);
                    uploaded.push(url);
                    options.onProgress?.({ completed: index + 1, total: files.length });
                }

                resolve(uploaded);
            } catch (err) {
                reject(err);
            }
        };

        input.click();
    });
}
