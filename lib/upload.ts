import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

// Uploads a picked image to a storage bucket and returns its public URL.
export async function uploadAsset(bucket: string, folder: string, a: ImagePicker.ImagePickerAsset): Promise<string> {
  const mime = a.mimeType ?? 'image/jpeg';
  const ext = mime.split('/')[1] === 'png' ? 'png' : mime.split('/')[1] === 'webp' ? 'webp' : 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  let body: any;
  if (Platform.OS === 'web') body = await (await fetch(a.uri)).blob();
  else { body = new FormData(); body.append('file', { uri: a.uri, name: path.split('/').pop(), type: mime } as any); }
  const up = await supabase.storage.from(bucket).upload(path, body, { contentType: mime });
  if (up.error) throw new Error(up.error.message);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function pickImage(square = false) {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: square, aspect: square ? [1, 1] : undefined });
  return res.canceled ? null : res.assets[0];
}
