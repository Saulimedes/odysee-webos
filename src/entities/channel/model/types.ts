export interface Channel {
  id: string;
  name: string;
  title: string;
  description: string;
  thumb: string | null;
}

export interface RawChannelClaim {
  claim_id: string;
  name?: string;
  value?: { title?: string; description?: string; thumbnail?: { url?: string } };
}
