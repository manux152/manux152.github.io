import { Platform } from 'react-native';

/** Voice calls use WebRTC, which browsers include. (Phone apps would need an extra native package.) */
export const canVoiceCall = Platform.OS === 'web' && typeof (globalThis as any).RTCPeerConnection !== 'undefined' && !!(globalThis as any).navigator?.mediaDevices?.getUserMedia;

export type CallPeer = { id: string; name: string; avatar: string | null };
type StartReq = { room: string; peer: CallPeer };
const starters = new Set<(r: StartReq) => void>();
/** Ask the call overlay (mounted once for the whole app) to start a call. */
export const startVoiceCall = (r: StartReq) => starters.forEach((l) => l(r));
export const onStartVoiceCall = (cb: (r: StartReq) => void) => { starters.add(cb); return () => { starters.delete(cb); }; };
