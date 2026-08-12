import type { ToolType } from '../types'

/** 刀具定义 */
export interface ToolDef {
  type: ToolType
  name: string
  diameter: number  // mm
  length: number    // mm
  shankDiameter: number
  color: string
  flutes: number
  description: string
}

/** 预设刀具库（8把刀，参考 CNC Simulator Pro） */
export const TOOL_LIBRARY: ToolDef[] = [
  { type: 'end_mill', name: '端铣刀 Ø1.0', diameter: 1.0, length: 4, shankDiameter: 1.2, color: '#e8c878', flutes: 3, description: '通用铣削' },
  { type: 'end_mill', name: '端铣刀 Ø2.0', diameter: 2.0, length: 5, shankDiameter: 2.4, color: '#e8c878', flutes: 3, description: '粗加工' },
  { type: 'end_mill', name: '端铣刀 Ø0.5', diameter: 0.5, length: 3, shankDiameter: 0.8, color: '#e8c878', flutes: 2, description: '精加工' },
  { type: 'ball_nose', name: '球刀 Ø1.0', diameter: 1.0, length: 4, shankDiameter: 1.2, color: '#a8d878', flutes: 2, description: '曲面加工' },
  { type: 'ball_nose', name: '球刀 Ø2.0', diameter: 2.0, length: 5, shankDiameter: 2.4, color: '#a8d878', flutes: 2, description: '3D雕刻' },
  { type: 'drill', name: '钻头 Ø0.5', diameter: 0.5, length: 4, shankDiameter: 0.8, color: '#d89878', flutes: 2, description: '钻孔' },
  { type: 'drill', name: '钻头 Ø1.0', diameter: 1.0, length: 5, shankDiameter: 1.2, color: '#d89878', flutes: 2, description: '钻孔' },
  { type: 'drill', name: '钻头 Ø2.0', diameter: 2.0, length: 6, shankDiameter: 2.4, color: '#d89878', flutes: 2, description: '大孔' },
]

/** 获取刀具半径 */
export function toolRadius(tool: ToolDef): number {
  return tool.diameter / 2
}

/** 根据类型+索引获取刀具 */
export function getToolByIndex(index: number): ToolDef {
  return TOOL_LIBRARY[index] ?? TOOL_LIBRARY[0]
}

// ===================== 材质库 =====================

export interface MaterialDef {
  id: string
  name: string
  color: string      // 顶面颜色
  sideColor: string  // 侧面颜色
  roughness: number
  metalness: number
}

/** 材质库（参考 CNC Simulator Pro） */
export const MATERIAL_LIBRARY: MaterialDef[] = [
  { id: 'aluminum', name: '铝合金', color: '#c0c8d0', sideColor: '#9098a0', roughness: 0.35, metalness: 0.85 },
  { id: 'steel', name: '钢', color: '#7a8088', sideColor: '#5a6068', roughness: 0.5, metalness: 0.9 },
  { id: 'brass', name: '黄铜', color: '#d4b870', sideColor: '#a4985a', roughness: 0.4, metalness: 0.9 },
  { id: 'copper', name: '紫铜', color: '#c08060', sideColor: '#905040', roughness: 0.4, metalness: 0.9 },
  { id: 'wood', name: '木材', color: '#b89060', sideColor: '#806040', roughness: 0.8, metalness: 0.1 },
  { id: 'delrin', name: '塑料', color: '#e0e0e0', sideColor: '#c0c0c0', roughness: 0.6, metalness: 0.2 },
  { id: 'carbon', name: '碳纤维', color: '#2a2a2a', sideColor: '#1a1a1a', roughness: 0.3, metalness: 0.5 },
  { id: 'gold', name: '金', color: '#e8c850', sideColor: '#c8a830', roughness: 0.2, metalness: 1.0 },
]

export function getMaterialById(id: string): MaterialDef {
  return MATERIAL_LIBRARY.find((m) => m.id === id) ?? MATERIAL_LIBRARY[0]
}
