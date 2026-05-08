// Lanhu data types

export interface LanhuProject {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  createdAt: string;
  updatedAt: string;
  teamId: string;
  teamName?: string;
  creatorId?: string;
  creatorName?: string;
  folderCount?: number;
  screenCount?: number;
}

export interface LanhuFolder {
  id: string;
  name: string;
  parentId?: string;
  projectId: string;
  order?: number;
  children?: LanhuFolder[];
}

export interface LanhuScreen {
  id: string;
  name: string;
  projectId: string;
  folderId?: string;
  width: number;
  height: number;
  coverUrl?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
  order?: number;
  hasPrototype?: boolean;
  commentCount?: number;
}

export interface LanhuLayer {
  id: string;
  name: string;
  screenId: string;
  parentId?: string;
  type: 'container' | 'text' | 'image' | 'shape' | 'group' | 'component';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  children?: LanhuLayer[];
  styles?: LanhuLayerStyles;
  textContent?: string;
}

export interface LanhuLayerStyles {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  boxShadow?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  opacity?: number;
  padding?: [number, number, number, number]; // top, right, bottom, left
}

export interface LanhuAsset {
  id: string;
  name: string;
  screenId: string;
  layerId?: string;
  format: 'png' | 'svg' | 'webp' | 'jpg';
  width: number;
  height: number;
  scale?: number;
  downloadUrl?: string;
  base64Data?: string;
}

export interface LanhuPrototypeLink {
  sourceScreenId: string;
  sourceLayerId?: string;
  targetScreenId: string;
  trigger: 'click' | 'hover' | 'drag';
  transition?: 'none' | 'slide' | 'fade' | 'push' | 'modal';
  duration?: number;
  hotspot?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface LanhuComment {
  id: string;
  screenId: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  position?: {
    x: number;
    y: number;
  };
  resolved?: boolean;
  replies?: LanhuComment[];
}

export interface LanhuColor {
  hex: string;
  name?: string;
  usage?: number; // count of times used
  layers?: string[]; // layer IDs using this color
}

export interface LanhuFont {
  family: string;
  size?: number;
  weight?: number;
  usage?: number;
  layers?: string[];
}

// Config types
export interface ServerConfig {
  wsPort: number;
  httpPort: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}