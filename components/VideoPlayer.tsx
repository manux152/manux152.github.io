import { useVideoPlayer, VideoView } from 'expo-video';
import { embedInfo } from '../lib/embed';

export function VideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  return <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: '#000' }} nativeControls allowsFullscreen />;
}
// Uploaded videos and direct video-file links play inline with our own player; YouTube, Vimeo etc. play in an embedded player (EmbeddedVideo).
export const isHosted = (url: string) => embedInfo(url).kind === 'file';
