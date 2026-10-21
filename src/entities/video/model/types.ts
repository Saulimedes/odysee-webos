export interface Video {
  id: string;
  title: string;
  thumb: string | null;
  duration: number;
  height: number;
  releaseTime: number;
  channelId?: string;
  channelName: string;
  channelTitle: string;
  channelThumb?: string;
  claimName: string;
  hash?: string;
}

export interface RawClaim {
  claim_id: string;
  name: string;
  timestamp?: number;
  value?: {
    title?: string;
    description?: string;
    release_time?: string;
    thumbnail?: { url?: string };
    video?: { duration?: number; height?: number };
    source?: { hash?: string };
    claims?: string[];
  };
  signing_channel?: {
    claim_id?: string;
    name?: string;
    value?: { title?: string; thumbnail?: { url?: string } };
  };
}
