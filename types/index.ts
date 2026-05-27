export type RarityTier = {
  id: string
  name: string
  weight_percent: number
  color_hex: string
  sort_order: number
}

export type Collection = {
  id: string
  name: string
  description: string
  cover_image_url: string
  mystery_title?: string         // 🟢 NEW
  mystery_thumbnail_url?: string // 🟢 NEW
  is_active: boolean
  videos: { count: number }[]
}

export type Video = {
  id: string
  title: string
  cdn_url: string
  thumbnail_url: string
  rarity_tiers: RarityTier
}

export type DropResult = {
  video_id: string
  title: string
  cdn_url: string
  thumbnail_url: string
  rarity: RarityTier
}

export type DropHistory = {
  id: number
  dropped_at: string
  collection: { name: string }[]
  videos: {
    title: string
    thumbnail_url: string
    rarity_tiers: RarityTier[]
  }[]
}