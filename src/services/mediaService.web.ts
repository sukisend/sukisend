// Web version: uses browser <input type="file"> + canvas resizing
import { supabase } from '../lib/supabase';

interface PickAndUploadImagesOptions {
    bucket: 'product-media' | 'review-media';
    folder: string;
    maxImages?: number;
    resizeWidth?: number;
    compress?: number;
}

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

export async function pickAndUploadImages(options: PickAndUploadImagesOptions): Promise<string[]> {
    const maxImages = options.maxImages ?? 5;
    const resizeWidth = options.resizeWidth ?? 1400;
    const compress = options.compress ?? 0.75;

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

                for (const file of files) {
                    const bitmap = await createImageBitmap(file);
                    const scale = Math.min(1, resizeWidth / bitmap.width);
                    const width = Math.round(bitmap.width * scale);
                    const height = Math.round(bitmap.height * scale);

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(bitmap, 0, 0, width, height);
                    bitmap.close();

                    const blob: Blob = await new Promise((res) =>
                        canvas.toBlob((b) => res(b!), 'image/webp', compress),
                    );
                    const url = await uploadBlob(blob, options.bucket, options.folder);
                    uploaded.push(url);
                }

                resolve(uploaded);
            } catch (err) {
                reject(err);
            }
        };

        input.click();
    });
}
