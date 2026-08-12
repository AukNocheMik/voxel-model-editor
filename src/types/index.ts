import * as THREE from 'three'

// ===================== 应用模式 =====================

/** 三大核心模式：顶点编辑、体素、CNC切削 */
export type AppMode = 'vertex' | 'voxel' | 'cnc'

// ===================== 几何体类型 =====================

export type GeometryType = 'cube' | 'sphere' | 'cylinder' | 'torus' | 'cone'

export interface GeometryParams {
  type: GeometryType
  /** 几何体尺寸（用于立方体/圆柱/锥体） */
  size: [number, number, number]
  /** 细分度，决定顶点数量 */
  detail: number
}

// ===================== 顶点编辑 =====================

/** 单个顶点数据 */
export interface VertexData {
  /** 原始位置（局部坐标） */
  original: THREE.Vector3
  /** 当前位置（可能被编辑过） */
  current: THREE.Vector3
  /** 是否被选中 */
  selected: boolean
}

/** 顶点编辑状态 */
export interface VertexEditState {
  /** 所有顶点 */
  vertices: VertexData[]
  /** 当前选中的顶点索引，-1 表示无 */
  selectedIndex: number
  /** 是否正在拖拽 */
  isDragging: boolean
}

// ===================== 体素 =====================

/** 单个体素 */
export interface Voxel {
  /** 体素中心位置（世界坐标） */
  position: [number, number, number]
  /** 体素边长 */
  size: number
  /** 是否被占据（在模型内部） */
  solid: boolean
}

/** 体素网格配置 */
export interface VoxelConfig {
  /** 每个轴向上的分辨率（体素数） */
  resolution: number
  /** 是否只显示外壳（表面体素） */
  shellOnly: boolean
  /** 体素间隙比例 0~0.8 */
  gap: number
  /** 是否启用渐变颜色 */
  colorGradient: boolean
}

/** 体素化结果 */
export interface VoxelizationResult {
  /** 体素列表 */
  voxels: Voxel[]
  /** 网格包围盒 */
  bounds: THREE.Box3
  /** 单个体素边长 */
  cellSize: number
  /** 分辨率 */
  resolution: number
  /** 统计信息 */
  stats: {
    total: number
    solid: number
    ratio: number
  }
}

// ===================== 全局应用状态 =====================

export interface AppState {
  /** 当前模式 */
  mode: AppMode
  /** 几何体参数 */
  geometry: GeometryParams
  /** 顶点编辑状态 */
  vertexEdit: VertexEditState
  /** 体素配置 */
  voxelConfig: VoxelConfig
  /** CNC 切削配置 */
  cncConfig: CncConfig
  /** CNC 回放状态 */
  playback: PlaybackState
  /** 渲染选项 */
  render: {
    showWireframe: boolean
    showVertices: boolean
    autoRotate: boolean
    showGrid: boolean
    showAxes: boolean
  }
}

// ===================== CNC 切削 =====================

/** 工件配置 */
export interface WorkpieceConfig {
  width: number   // X 方向（宽度）
  depth: number   // Z 方向（深度）
  height: number  // Y 方向（厚度，顶面在 Y=0，向下延伸）
}

/** 刀具类型 */
export type ToolType = 'end_mill' | 'ball_nose' | 'drill'

/** 刀具配置 */
export interface ToolConfig {
  type: ToolType
  /** 刀具直径 */
  diameter: number
  /** 刀具长度 */
  length: number
  /** 当前切削深度（负值） */
  cutDepth: number
}

/** CNC 切削模式配置 */
export interface CncConfig {
  workpiece: WorkpieceConfig
  tool: ToolConfig
  /** 高度图细分度 */
  resolution: number
  /** 是否正在切削（鼠标按下拖拽时为 true） */
  isCutting: boolean
  /** 切削速度倍率 */
  speedMultiplier: number
  /** 材质 ID */
  materialId: string
}

/** 回放状态 */
export interface PlaybackState {
  /** 是否正在播放 */
  isPlaying: boolean
  /** 当前 move 索引 */
  currentMoveIndex: number
  /** 当前 move 内的进度 0~1 */
  currentT: number
  /** 速度倍率 */
  speed: number
  /** 选中的示例程序 ID */
  programId: string
  /** 是否显示刀路线 */
  showToolpath: boolean
  /** 手动刀具覆盖索引（-1=使用程序自带刀具） */
  toolOverrideIndex: number
}
