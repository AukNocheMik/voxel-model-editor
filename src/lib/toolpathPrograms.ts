import type { ToolType } from '../types'
import { TOOL_LIBRARY, type ToolDef } from './toolLibrary'

// ===================== 刀路移动定义 =====================

/** 移动类型 */
export type MoveType = 'rapid' | 'feed' | 'drill'

/** 单个刀路移动指令 */
export interface CutMove {
  type: MoveType
  from: { x: number; y: number; z: number }
  to: { x: number; y: number; z: number }
  toolIndex: number
  tool: ToolDef
  /** 路径长度（计算用） */
  length: number
  /** 进给速度 mm/min */
  feedRate: number
  /** 主轴转速 RPM */
  spindleSpeed: number
}

/**
 * G-code → CutMove 的简化解析器。
 * 支持的命令：G0(快速) G1(直线) G81(钻孔) M3/M5(主轴) T(换刀) F(进给) S(转速)
 */
export function parseGCode(
  gcode: string,
  originX = 0,
  originZ = 0,
): CutMove[] {
  const lines = gcode.split('\n')
  const moves: CutMove[] = []

  let pos = { x: 0, y: 0, z: 5 }
  let toolIndex = 0
  let feedRate = 500
  let spindleSpeed = 8000

  for (const rawLine of lines) {
    let line = rawLine.trim()
    // 去除注释
    const semi = line.indexOf(';')
    if (semi >= 0) line = line.substring(0, semi).trim()
    line = line.replace(/\([^)]*\)/g, '').trim()
    if (!line) continue

    // 提取所有参数
    const params: Record<string, number> = {}
    const parts = line.split(/\s+/)
    const cmdPart = parts[0].toUpperCase()
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i]
      const letter = p[0].toUpperCase()
      const val = parseFloat(p.substring(1))
      if (!isNaN(val)) params[letter] = val
    }

    // G-code
    if (cmdPart.startsWith('G')) {
      const g = parseInt(cmdPart.substring(1))

      if (g === 0 || g === 1) {
        const newPos = {
          x: params.X !== undefined ? params.X : pos.x,
          y: params.Y !== undefined ? params.Y : pos.y,
          z: params.Z !== undefined ? params.Z : pos.z,
        }
        const dx = newPos.x - pos.x
        const dz = newPos.z - pos.z
        const dy = newPos.y - pos.y
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz)

        moves.push({
          type: g === 0 ? 'rapid' : 'feed',
          from: { ...pos },
          to: newPos,
          toolIndex,
          tool: TOOL_LIBRARY[toolIndex],
          length: len,
          feedRate: g === 0 ? 3000 : feedRate,
          spindleSpeed,
        })
        pos = newPos
      } else if (g === 81) {
        // 钻孔循环：快速下钻到 Z 深度，然后快速抬起
        const drillDepth = params.Z ?? -1
        moves.push({
          type: 'drill',
          from: { ...pos },
          to: { ...pos, z: drillDepth },
          toolIndex,
          tool: TOOL_LIBRARY[toolIndex],
          length: Math.abs(drillDepth - pos.z),
          feedRate,
          spindleSpeed,
        })
        // 钻完抬起
        moves.push({
          type: 'rapid',
          from: { ...pos, z: drillDepth },
          to: { ...pos, z: 5 },
          toolIndex,
          tool: TOOL_LIBRARY[toolIndex],
          length: Math.abs(5 - drillDepth),
          feedRate: 3000,
          spindleSpeed,
        })
      }
    } else if (cmdPart.startsWith('M')) {
      const m = parseInt(cmdPart.substring(1))
      if (m === 3 || m === 4) {
        if (params.S !== undefined) spindleSpeed = params.S
      }
    } else if (cmdPart.startsWith('T')) {
      const t = parseInt(cmdPart.substring(1))
      toolIndex = Math.max(0, Math.min(TOOL_LIBRARY.length - 1, t - 1))
    } else if (cmdPart.startsWith('F')) {
      feedRate = parseFloat(cmdPart.substring(1))
    } else if (cmdPart.startsWith('S')) {
      spindleSpeed = parseFloat(cmdPart.substring(1))
    }
  }

  return moves
}

// ===================== 示例刀路程序 =====================

export interface ExampleProgram {
  id: string
  name: string
  category: string
  description: string
  toolIndex: number
  gcode: string
}

/** 示例程序库 */
export const EXAMPLE_PROGRAMS: ExampleProgram[] = [
  {
    id: 'circle_pocket',
    name: '圆形槽',
    category: '入门',
    description: '螺旋切削一个圆形凹槽',
    toolIndex: 0,
    gcode: generateCirclePocket(),
  },
  {
    id: 'holes',
    name: '5孔钻孔',
    category: '入门',
    description: 'G81 钻孔循环打 5 个孔',
    toolIndex: 5,
    gcode: generateHoles(),
  },
  {
    id: 'spiral',
    name: '螺旋花纹',
    category: '进阶',
    description: '从中心向外螺旋切削',
    toolIndex: 0,
    gcode: generateSpiral(),
  },
  {
    id: 'heart',
    name: '心形雕刻',
    category: '趣味',
    description: '雕刻一个心形图案',
    toolIndex: 2,
    gcode: generateHeart(),
  },
  {
    id: 'text_cnc',
    name: 'CNC 文字',
    category: '趣味',
    description: '雕刻 CNC 三个字母',
    toolIndex: 2,
    gcode: generateTextCNC(),
  },
  {
    id: 'grid_pockets',
    name: '网格阵列',
    category: '进阶',
    description: '3×3 矩阵挖槽',
    toolIndex: 0,
    gcode: generateGridPockets(),
  },
]

/** 生成圆形槽 G-code */
function generateCirclePocket(): string {
  const lines: string[] = []
  lines.push('; 圆形槽')
  lines.push('G21 G90')
  lines.push('T1 M6')
  lines.push('M3 S8000')
  lines.push('G0 Z5')
  lines.push('G0 X4 Y4')
  // 螺旋从内到外
  for (let r = 0.5; r <= 2.5; r += 0.3) {
    const segs = Math.max(32, Math.ceil(r * 24))
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2
      const x = 4 + Math.cos(a) * r
      const y = 4 + Math.sin(a) * r
      if (r === 0.5 && s === 0) {
        lines.push(`G1 Z-0.8 F200`)
        lines.push(`G1 X${x.toFixed(2)} Y${y.toFixed(2)} F600`)
      } else {
        lines.push(`G1 X${x.toFixed(2)} Y${y.toFixed(2)} Z-0.8`)
      }
    }
  }
  lines.push('G0 Z5')
  lines.push('G0 X0 Y0')
  lines.push('M5')
  return lines.join('\n')
}

/** 生成 5 孔钻孔 G-code */
function generateHoles(): string {
  const lines: string[] = []
  lines.push('; 5孔钻孔 (G81)')
  lines.push('G21 G90')
  lines.push('T7 M6')
  lines.push('M3 S6000')
  lines.push('G0 Z5')
  const holes = [
    [2, 2], [6, 2], [4, 4], [2, 6], [6, 6],
  ]
  for (const [x, y] of holes) {
    lines.push(`G0 X${x} Y${y}`)
    lines.push(`G81 Z-1.5 F100`)
  }
  lines.push('G0 Z5')
  lines.push('G0 X0 Y0')
  lines.push('M5')
  return lines.join('\n')
}

/** 生成螺旋花纹 G-code */
function generateSpiral(): string {
  const lines: string[] = []
  lines.push('; 螺旋花纹')
  lines.push('G21 G90')
  lines.push('T1 M6')
  lines.push('M3 S10000')
  lines.push('G0 Z5')
  lines.push('G0 X4 Y4')
  lines.push('G1 Z-0.5 F200')
  const segs = 200
  for (let s = 0; s <= segs; s++) {
    const t = s / segs
    const a = t * Math.PI * 10
    const r = t * 3
    const x = 4 + Math.cos(a) * r
    const y = 4 + Math.sin(a) * r
    lines.push(`G1 X${x.toFixed(2)} Y${y.toFixed(2)} Z-0.5 F800`)
  }
  lines.push('G0 Z5')
  lines.push('G0 X0 Y0')
  lines.push('M5')
  return lines.join('\n')
}

/** 生成心形 G-code */
function generateHeart(): string {
  const lines: string[] = []
  lines.push('; 心形雕刻')
  lines.push('G21 G90')
  lines.push('T1 M6')
  lines.push('M3 S12000')
  lines.push('G0 Z5')
  const segs = 120
  const cx = 4, cy = 4.5
  for (let s = 0; s <= segs; s++) {
    const t = (s / segs) * Math.PI * 2
    // 心形参数方程
    const x = cx + 1.5 * (16 * Math.pow(Math.sin(t), 3)) / 16
    const y = cy + 1.5 * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 16
    if (s === 0) {
      lines.push(`G0 X${x.toFixed(2)} Y${y.toFixed(2)}`)
      lines.push(`G1 Z-0.6 F200`)
    } else {
      lines.push(`G1 X${x.toFixed(2)} Y${y.toFixed(2)} Z-0.6 F600`)
    }
  }
  lines.push('G0 Z5')
  lines.push('G0 X0 Y0')
  lines.push('M5')
  return lines.join('\n')
}

/** 生成 CNC 文字 G-code */
function generateTextCNC(): string {
  const lines: string[] = []
  lines.push('; CNC 文字雕刻')
  lines.push('G21 G90')
  lines.push('T3 M6')
  lines.push('M3 S12000')
  lines.push('G0 Z5')
  // C 字母
  const cPoints = letterC(1.5, 3)
  writeLetterPath(lines, cPoints)
  // N 字母
  const nPoints = letterN(3.5, 3)
  writeLetterPath(lines, nPoints)
  // C 字母
  const cPoints2 = letterC(5.5, 3)
  writeLetterPath(lines, cPoints2)
  lines.push('G0 Z5')
  lines.push('G0 X0 Y0')
  lines.push('M5')
  return lines.join('\n')
}

function writeLetterPath(lines: string[], pts: [number, number][]) {
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]
    if (i === 0) {
      lines.push(`G0 X${x.toFixed(2)} Y${y.toFixed(2)}`)
      lines.push(`G1 Z-0.5 F200`)
    } else {
      lines.push(`G1 X${x.toFixed(2)} Y${y.toFixed(2)} F600`)
    }
  }
  lines.push('G0 Z3')
}

function letterC(x0: number, y0: number): [number, number][] {
  const pts: [number, number][] = []
  const segs = 30
  for (let s = 0; s <= segs; s++) {
    const a = Math.PI * 0.6 + (s / segs) * Math.PI * 1.8
    pts.push([x0 + 0.8 + Math.cos(a) * 0.7, y0 + Math.sin(a) * 0.9])
  }
  return pts
}

function letterN(x0: number, y0: number): [number, number][] {
  return [
    [x0, y0 - 0.9],
    [x0, y0 + 0.9],
    [x0 + 1.0, y0 - 0.9],
    [x0 + 1.0, y0 + 0.9],
  ]
}

/** 生成 3×3 网格阵列槽 G-code */
function generateGridPockets(): string {
  const lines: string[] = []
  lines.push('; 网格阵列槽')
  lines.push('G21 G90')
  lines.push('T1 M6')
  lines.push('M3 S8000')
  lines.push('G0 Z5')
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = 1.5 + col * 2.5
      const cy = 1.5 + row * 2.5
      // 小方槽
      lines.push(`G0 X${cx} Y${cy}`)
      lines.push(`G1 Z-0.6 F200`)
      lines.push(`G1 X${cx + 1.2} Y${cy} F600`)
      lines.push(`G1 X${cx + 1.2} Y${cy + 1.2}`)
      lines.push(`G1 X${cx} Y${cy + 1.2}`)
      lines.push(`G1 X${cx} Y${cy}`)
      lines.push(`G0 Z3`)
    }
  }
  lines.push('G0 Z5')
  lines.push('G0 X0 Y0')
  lines.push('M5')
  return lines.join('\n')
}
