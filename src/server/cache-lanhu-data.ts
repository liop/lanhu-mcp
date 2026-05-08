import type { DataStore } from './data-store.js';
import type {
  LanhuAsset,
  LanhuColor,
  LanhuComment,
  LanhuFont,
  LanhuLayer,
  LanhuProject,
  LanhuPrototypeLink,
  LanhuScreen
} from '../shared/types.js';

export function cacheLanhuData(
  dataStore: DataStore,
  dataType: string,
  data: unknown,
  context: Record<string, unknown> = {}
): void {
  switch (dataType) {
    case 'projects':
      if (Array.isArray(data)) {
        dataStore.setProjects(data as LanhuProject[]);
      }
      break;
    case 'project':
      if (Array.isArray(data)) {
        dataStore.setProjects(data as LanhuProject[]);
      } else if (data && typeof data === 'object') {
        dataStore.setProject(data as LanhuProject);
      }
      break;
    case 'screens':
      if (Array.isArray(data)) {
        dataStore.setScreens(data as LanhuScreen[], context.projectId as string | undefined);
      }
      break;
    case 'screen':
      if (Array.isArray(data)) {
        dataStore.setScreens(data as LanhuScreen[], context.projectId as string | undefined);
      } else if (data && typeof data === 'object') {
        const screen = context.projectId
          ? { ...(data as Record<string, unknown>), projectId: context.projectId }
          : data;
        dataStore.setScreen(screen as LanhuScreen);
      }
      break;
    case 'layers':
      if (Array.isArray(data) && context.screenId) {
        dataStore.setLayers(context.screenId as string, data as LanhuLayer[]);
      }
      break;
    case 'assets':
      if (Array.isArray(data) && context.screenId) {
        dataStore.setAssets(context.screenId as string, data as LanhuAsset[]);
      }
      break;
    case 'prototype_links':
      if (Array.isArray(data) && context.screenId) {
        dataStore.setPrototypeLinks(context.screenId as string, data as LanhuPrototypeLink[]);
      }
      break;
    case 'comments':
      if (Array.isArray(data) && context.screenId) {
        dataStore.setComments(context.screenId as string, data as LanhuComment[]);
      }
      break;
    case 'colors':
      if (Array.isArray(data) && context.screenId) {
        dataStore.setColors(context.screenId as string, data as LanhuColor[]);
      }
      break;
    case 'fonts':
      if (Array.isArray(data) && context.screenId) {
        dataStore.setFonts(context.screenId as string, data as LanhuFont[]);
      }
      break;
    case 'project_tree':
      if (context.projectId) {
        dataStore.setProjectTree(context.projectId as string, data);
      }
      break;
    case 'layer_styles':
      if (context.screenId && data && typeof data === 'object' && 'layerId' in data) {
        dataStore.setLayerStyles(context.screenId as string, (data as Record<string, unknown>).layerId as string, data);
      }
      break;
    case 'prototype_flow':
      if (context.projectId) {
        dataStore.setPrototypeFlow(context.projectId as string, data);
      }
      break;
  }
}
