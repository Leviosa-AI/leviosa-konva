// Carousel block data contract — the single source of truth (TS side).
// Mirrors the Python model in leviosa-marketing-db-schema (block_content.py).
// Both leviosa-frontend and leviosa-rendering-server import these from here.

export type BlockType = "text" | "media" | "rect" | "emoji" | "label";
export type MediaType = "image" | "video";
export type EmojiKind = "emoji" | "icon";
export type Align = "left" | "center" | "right";
export type Fit = "cover" | "contain";

export interface FillLinearGradient {
  start: { x: number; y: number };
  end: { x: number; y: number };
  color_stops: Array<{ offset: number; color: string }>;
}

export interface TextSegment {
  text: string;
  color?: string | null;
  font_weight?: string | null;
}

export interface TextContent {
  text?: string; // default ""
  role?: string | null;
  source?: string | null;
  font_size?: number; // default 24
  font_family?: string; // default "Pretendard"
  font_weight?: string; // default "700"
  font_style?: string | null;
  text_decoration?: string | null;
  color?: string; // default "#FFFFFF"
  line_height?: number; // default 1.2
  letter_spacing?: number; // default 0
  align?: Align; // default "left"
  text_shadow_color?: string | null;
  text_shadow_size?: number | null;
  target_lines?: number | null;
  segments?: TextSegment[] | null;
  fill_linear_gradient?: FillLinearGradient | null;
  corner_radius?: number; // default 0
  opacity?: number | null;
}

export interface MediaContent {
  media_type: MediaType;
  src?: string; // default ""
  fit?: Fit; // default "cover"
  focal_x?: number; // default 0.5
  focal_y?: number; // default 0.5
  corner_radius?: number; // default 0
  fill_linear_gradient?: FillLinearGradient | null;
  opacity?: number | null;
  stroke?: string | null;
  include_audio?: boolean | null;
  // GAP FIX: editor writes an image filter/preset (image-layer-editor.tsx) that
  // had no home in block.content and was dropped on save. Added here so the
  // round-trip is lossless. TODO: mirror in db-schema MediaContent + frontend types.
  image_preset?: string | null;
}

export interface RectContent {
  role?: string | null;
  source?: string | null;
  text?: string | null;
  font_size?: number | null;
  font_family?: string | null;
  font_weight?: string | null;
  color?: string | null;
  line_height?: number | null;
  letter_spacing?: number | null;
  align?: Align | null;
  fill?: string | null;
  fill_linear_gradient?: FillLinearGradient | null;
  alpha?: number | null;
  stroke?: string | null;
  stroke_width?: number | null;
  corner_radius?: number; // default 0
  last_solid_fill?: string | null;
  last_solid_opacity?: number | null;
  last_fill_linear_gradient?: FillLinearGradient | null;
}

export interface EmojiContent {
  kind?: EmojiKind; // default "emoji"
  value: string;
  font_size?: number; // default 80
  color?: string; // default "#FFFFFF"
  opacity?: number | null;
}

export interface LabelContent {
  text?: string; // default ""
  font_size?: number; // default 18
  font_family?: string; // default "Pretendard"
  font_weight?: string; // default "700"
  color?: string; // default "#FFFFFF"
  line_height?: number; // default 1.2
  letter_spacing?: number; // default 0
  align?: Align; // default "left"
  background?: string | null;
  stroke?: string | null;
  stroke_width?: number | null;
  corner_radius?: number; // default 0
  padding?: { x?: number; y?: number } | null;
}

interface BaseBlock {
  id: string;
  z: number; // default 0
  x: number; // default 0
  y: number; // default 0
  w: number;
  h: number;
  rotation: number; // default 0
  locked: boolean; // default false
  // NOTE: numbering badges are identified by name === "content_number"
  // (NOT content.role/source). The detector must key on this.
  name?: string | null;
}

export interface TextBlock extends BaseBlock {
  type: "text";
  content: TextContent;
}

export interface MediaBlock extends BaseBlock {
  type: "media";
  content: MediaContent;
}

export interface RectBlock extends BaseBlock {
  type: "rect";
  content: RectContent;
}

export interface EmojiBlock extends BaseBlock {
  type: "emoji";
  content: EmojiContent;
}

export interface LabelBlock extends BaseBlock {
  type: "label";
  content: LabelContent;
}

export type Block = TextBlock | MediaBlock | RectBlock | EmojiBlock | LabelBlock;

export interface Slide {
  id: string;
  slide_type_key?: string | null;
  blocks: Block[];
}

export interface BrandConfigDict {
  logo_url?: string | null;
  account?: string | null;
  brand_name?: string | null;
  brand_tagline?: string | null;
  cta_text?: string | null;
}

export interface CarouselSlideRenderInput {
  slide: Slide;
  slide_number?: number;
  slide_count?: number;
  canvas_width: number; // default 1080
  canvas_height: number; // default 1350
  canvas_background?: string | null; // default "#000000" applied at render
  brand_config?: BrandConfigDict | null;
  asset_map?: Record<string, string> | null;
  pixel_ratio: number;
}
