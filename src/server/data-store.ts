// Data store for caching Lanhu data

import { info, debug } from '../utils/logger.js';
import type {
  LanhuProject,
  LanhuScreen,
  LanhuLayer,
  LanhuAsset,
  LanhuPrototypeLink,
  LanhuComment,
  LanhuColor,
  LanhuFont
} from '../shared/types.js';

interface CachedData {
  projects: Map<string, LanhuProject>;
  screens: Map<string, LanhuScreen>;
  layers: Map<string, LanhuLayer>; // key: screenId-layerId
  assets: Map<string, LanhuAsset>;
  prototypeLinks: Map<string, LanhuPrototypeLink[]>; // key: screenId
  comments: Map<string, LanhuComment[]>; // key: screenId
  colors: Map<string, LanhuColor[]>; // key: screenId
  fonts: Map<string, LanhuFont[]>; // key: screenId
  projectTrees: Map<string, unknown>; // key: projectId
  layerStyles: Map<string, unknown>; // key: screenId-layerId
  prototypeFlows: Map<string, unknown>; // key: projectId
}

export class DataStore {
  private data: CachedData = {
    projects: new Map(),
    screens: new Map(),
    layers: new Map(),
    assets: new Map(),
    prototypeLinks: new Map(),
    comments: new Map(),
    colors: new Map(),
    fonts: new Map(),
    projectTrees: new Map(),
    layerStyles: new Map(),
    prototypeFlows: new Map()
  };

  // Projects
  setProject(project: LanhuProject): void {
    if (!project?.id) return;
    this.data.projects.set(project.id, project);
    debug(`Cached project: ${project.id}`);
  }

  setProjects(projects: LanhuProject[]): void {
    for (const project of projects) {
      if (project?.id) {
        this.data.projects.set(project.id, project);
      }
    }
    info(`Cached ${projects.length} projects`);
  }

  getProject(id: string): LanhuProject | undefined {
    return this.data.projects.get(id);
  }

  listProjects(): LanhuProject[] {
    return Array.from(this.data.projects.values());
  }

  // Screens
  setScreen(screen: LanhuScreen): void {
    if (!screen?.id) return;
    this.data.screens.set(screen.id, screen);
    debug(`Cached screen: ${screen.id}`);
  }

  setScreens(screens: LanhuScreen[], projectId?: string): void {
    for (const screen of screens) {
      if (screen?.id) {
        this.data.screens.set(screen.id, projectId && !screen.projectId ? { ...screen, projectId } : screen);
      }
    }
    info(`Cached ${screens.length} screens for project ${projectId || 'unknown'}`);
  }

  getScreen(id: string): LanhuScreen | undefined {
    return this.data.screens.get(id);
  }

  listScreens(projectId?: string): LanhuScreen[] {
    const screens = Array.from(this.data.screens.values());
    if (projectId) {
      return screens.filter(s => s.projectId === projectId);
    }
    return screens;
  }

  // Layers
  setLayers(screenId: string, layers: LanhuLayer[]): void {
    for (const layer of layers) {
      if (layer?.id) {
        this.data.layers.set(`${screenId}-${layer.id}`, layer.screenId ? layer : { ...layer, screenId });
      }
    }
    info(`Cached ${layers.length} layers for screen ${screenId}`);
  }

  getLayer(screenId: string, layerId: string): LanhuLayer | undefined {
    return this.data.layers.get(`${screenId}-${layerId}`);
  }

  getLayers(screenId: string): LanhuLayer[] {
    const layers: LanhuLayer[] = [];
    for (const [key, layer] of this.data.layers) {
      if (key.startsWith(`${screenId}-`)) {
        layers.push(layer);
      }
    }
    return layers;
  }

  // Assets
  setAssets(screenId: string, assets: LanhuAsset[]): void {
    for (const asset of assets) {
      if (asset?.id) {
        this.data.assets.set(asset.id, asset.screenId ? asset : { ...asset, screenId });
      }
    }
    info(`Cached ${assets.length} assets for screen ${screenId}`);
  }

  getAsset(id: string): LanhuAsset | undefined {
    return this.data.assets.get(id);
  }

  listAssets(screenId: string): LanhuAsset[] {
    const assets = Array.from(this.data.assets.values());
    return assets.filter(a => a.screenId === screenId);
  }

  // Prototype Links
  setPrototypeLinks(screenId: string, links: LanhuPrototypeLink[]): void {
    this.data.prototypeLinks.set(screenId, links);
    info(`Cached ${links.length} prototype links for screen ${screenId}`);
  }

  getPrototypeLinks(screenId: string): LanhuPrototypeLink[] | undefined {
    return this.data.prototypeLinks.get(screenId);
  }

  // Comments
  setComments(screenId: string, comments: LanhuComment[]): void {
    this.data.comments.set(screenId, comments);
    info(`Cached ${comments.length} comments for screen ${screenId}`);
  }

  getComments(screenId: string): LanhuComment[] | undefined {
    return this.data.comments.get(screenId);
  }

  // Colors
  setColors(screenId: string, colors: LanhuColor[]): void {
    this.data.colors.set(screenId, colors);
    info(`Cached ${colors.length} colors for screen ${screenId}`);
  }

  getColors(screenId: string): LanhuColor[] | undefined {
    return this.data.colors.get(screenId);
  }

  // Fonts
  setFonts(screenId: string, fonts: LanhuFont[]): void {
    this.data.fonts.set(screenId, fonts);
    info(`Cached ${fonts.length} fonts for screen ${screenId}`);
  }

  getFonts(screenId: string): LanhuFont[] | undefined {
    return this.data.fonts.get(screenId);
  }

  // Clear all data
  clear(): void {
    this.data.projects.clear();
    this.data.screens.clear();
    this.data.layers.clear();
    this.data.assets.clear();
    this.data.prototypeLinks.clear();
    this.data.comments.clear();
    this.data.colors.clear();
    this.data.fonts.clear();
    this.data.projectTrees.clear();
    this.data.layerStyles.clear();
    this.data.prototypeFlows.clear();
    info('Data store cleared');
  }

  // Project Tree
  setProjectTree(projectId: string, tree: unknown): void {
    this.data.projectTrees.set(projectId, tree);
    info(`Cached project tree for project ${projectId}`);
  }

  getProjectTree(projectId: string): unknown | undefined {
    return this.data.projectTrees.get(projectId);
  }

  // Layer Styles
  setLayerStyles(screenId: string, layerId: string, styles: unknown): void {
    this.data.layerStyles.set(`${screenId}-${layerId}`, styles);
    debug(`Cached layer styles for ${screenId}-${layerId}`);
  }

  getLayerStyles(screenId: string, layerId: string): unknown | undefined {
    return this.data.layerStyles.get(`${screenId}-${layerId}`);
  }

  // Prototype Flow
  setPrototypeFlow(projectId: string, flow: unknown): void {
    this.data.prototypeFlows.set(projectId, flow);
    info(`Cached prototype flow for project ${projectId}`);
  }

  getPrototypeFlow(projectId: string): unknown | undefined {
    return this.data.prototypeFlows.get(projectId);
  }

  // Get stats
  getStats(): Record<string, number> {
    return {
      projects: this.data.projects.size,
      screens: this.data.screens.size,
      layers: this.data.layers.size,
      assets: this.data.assets.size,
      prototypeLinks: this.data.prototypeLinks.size,
      comments: this.data.comments.size,
      colors: this.data.colors.size,
      fonts: this.data.fonts.size,
      projectTrees: this.data.projectTrees.size,
      layerStyles: this.data.layerStyles.size,
      prototypeFlows: this.data.prototypeFlows.size
    };
  }
}
