import * as THREE from 'three'
import type { ToolType } from '../types'
import type { ToolDef } from './toolLibrary'
import type { CutMove } from './toolpathPrograms'

/**
 * 高度图切削引擎 (Heightmap Carving Engine)
 *
 * 工件 = 长方体 + N×N 细分顶面网格。
 * 每个网格顶点有高度值：0=未切削，负值=切削深度。
 * 刀具经过时在高度图上盖印，渲染时位移 Y 坐标。
 *
 * 不同刀具类型有不同的切削轮廓：
 * - end_mill: 平底圆盘（均匀深度）
 * - ball_nose: 球形底部（边缘渐浅）
 * - drill: 尖头（小半径深孔）
 */

export interface HeightmapSurface {
  geometry: THREE.BufferGeometry
  N: number
  heights: Float32Array
  apply: () => void
  reset: () => void
}

export function createHeightmapSurface(
  width: number,
  depth: number,
  N: number,
  originX: number,
  originZ: number,
): HeightmapSurface {
  const cols = N + 1
  const count = cols * cols
  const positions = new Float32Array(count * 3)
  const heights = new Float32Array(count)

  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i
      positions[idx * 3] = originX + (i / N) * width
      positions[idx * 3 + 1] = 0
      positions[idx * 3 + 2] = originZ - (j / N) * depth
    }
  }

  const indices: number[] = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * cols + i
      const b = j * cols + i + 1
      const c = (j + 1) * cols + i + 1
      const d = (j + 1) * cols + i
      indices.push(a, c, b, a, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return {
    geometry, N, heights,
    apply() {
      const pos = geometry.getAttribute('position') as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      for (let i = 0; i < count; i++) arr[i * 3 + 1] = heights[i]
      pos.needsUpdate = true
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
    },
    reset() {
      for (let i = 0; i < count; i++) { heights[i] = 0; positions[i * 3 + 1] = 0 }
      const pos = geometry.getAttribute('position') as THREE.BufferAttribute
      pos.needsUpdate = true
      geometry.computeVertexNormals()
    },
  }
}

/**
 * 在高度图上盖印一个刀具横截面。
 * 根据刀具类型产生不同的切削轮廓。
 *
 * 坐标约定：px 和 pz 均为 G-code 坐标空间（[0,width] × [0,depth]）。
 * originX / originZ 仅用于 createHeightmapSurface 的世界渲染偏移，
 * 此函数内部完全在 G-code 空间计算，不需要世界原点转换。
 */
export function stampDisc(
  hm: Float32Array, N: number, width: number, depth: number,
  _originX: number, _originZ: number,
  px: number, pz: number,
  tool: ToolDef,
  dz: number, maxDepth: number,
): void {
  if (dz >= 0) return
  const cutZ = Math.max(dz, -maxDepth)
  const radius = tool.diameter / 2
  const cols = N + 1
  const sx = width / N
  const sz = depth / N
  const edgeMargin = Math.min(sx, sz) * 0.75

  // 钻头半径更小（尖头效应）
  let effectiveRadius = radius
  if (tool.type === 'drill') {
    effectiveRadius = radius * 0.7
  }

  const rMax = effectiveRadius + edgeMargin
  const rMax2 = rMax * rMax

  // px, pz 已在 G-code 空间 [0,width]×[0,depth]，直接用作局部坐标
  const localPx = px
  const localPz = pz
  const i0 = Math.max(0, Math.floor((localPx - rMax) / sx))
  const i1 = Math.min(N, Math.ceil((localPx + rMax) / sx))
  const j0 = Math.max(0, Math.floor((localPz - rMax) / sz))
  const j1 = Math.min(N, Math.ceil((localPz + rMax) / sz))

  for (let j = j0; j <= j1; j++) {
    // 网格顶点在 G-code 空间的 Z(=depth) 坐标
    const wz = (j / N) * depth
    const dz2 = (wz - pz) * (wz - pz)
    if (dz2 > rMax2) continue
    for (let i = i0; i <= i1; i++) {
      // 网格顶点在 G-code 空间的 X 坐标
      const wx = (i / N) * width
      const dx2 = (wx - px) * (wx - px)
      const d2 = dx2 + dz2
      if (d2 > rMax2) continue

      const dist = Math.sqrt(d2)
      let effectiveCutZ = cutZ

      if (tool.type === 'ball_nose') {
        // 球刀：球形轮廓，边缘渐浅
        if (dist > effectiveRadius) {
          const factor = (dist - effectiveRadius) / edgeMargin
          effectiveCutZ = cutZ * (1 - factor)
        } else {
          // 在半径内，球形底部产生平滑曲面
          const ballFactor = 1 - Math.sqrt(1 - (dist / effectiveRadius) ** 2) * 0.3
          effectiveCutZ = cutZ * ballFactor
        }
      } else if (tool.type === 'drill') {
        // 钻头：中心深，边缘浅（尖头效应）
        if (dist > effectiveRadius) {
          const factor = (dist - effectiveRadius) / edgeMargin
          effectiveCutZ = cutZ * (1 - factor) * 0.3
        } else {
          // 锥形：越靠近中心越深
          const coneFactor = 1 - (dist / effectiveRadius) * 0.6
          effectiveCutZ = cutZ * coneFactor
        }
      } else {
        // 端铣刀：平底，边缘有 chamfer
        if (dist > effectiveRadius) {
          const factor = (dist - effectiveRadius) / edgeMargin
          effectiveCutZ = cutZ * (1 - factor)
        }
      }

      const idx = j * cols + i
      if (effectiveCutZ < hm[idx]) hm[idx] = effectiveCutZ
    }
  }
}

/** 沿路径采样切削 */
export function stampPath(
  hm: Float32Array, N: number, width: number, depth: number,
  originX: number, originZ: number,
  fromX: number, fromZ: number, fromD: number,
  toX: number, toZ: number, toD: number,
  tool: ToolDef, maxDepth: number,
): void {
  const dx = toX - fromX
  const dz = toZ - fromZ
  const dd = toD - fromD
  const len = Math.sqrt(dx * dx + dz * dz)
  const radius = tool.diameter / 2
  const stepSize = Math.max(radius * 0.4, 0.15)
  const steps = Math.max(1, Math.ceil(len / stepSize))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    stampDisc(hm, N, width, depth, originX, originZ,
      fromX + dx * t, fromZ + dz * t, tool, fromD + dd * t, maxDepth)
  }
}

/**
 * 执行单个 CutMove（G-code 移动指令），在高度图上切削。
 * G-code 坐标: X→工件X, Y→工件Z(深度方向), Z→切削深度
 */
export function stampMove(
  hm: Float32Array,
  N: number,
  width: number,
  depth: number,
  originX: number,
  originZ: number,
  moveToolCenterX: number,  // G-code X
  moveToolCenterY: number,  // G-code Y (映射到 Z 轴方向)
  moveDepthZ: number,       // G-code Z (切削深度)
  tool: ToolDef,
  maxDepth: number,
): void {
  if (moveDepthZ >= 0) return // 不切削
  stampDisc(hm, N, width, depth, originX, originZ,
    moveToolCenterX, moveToolCenterY, tool, moveDepthZ, maxDepth)
}

// ===================== 回放系统 =====================

/**
 * 从当前位置（t=0 起点 → t=1 终点）插值采样。
 */
export function sampleMovePoint(
  move: CutMove,
  t: number,
): { x: number; y: number; z: number } {
  return {
    x: move.from.x + (move.to.x - move.from.x) * t,
    y: move.from.y + (move.to.y - move.from.y) * t,
    z: move.from.z + (move.to.z - move.from.z) * t,
  }
}

/**
 * 构建累积高度图数组：result[k] = 执行完前 k 条指令后的高度图。
 * result[0] = 全 0（未切削）。用于回放时的快速跳转。
 *
 * 注意：这只存储每条 move 执行后的快照（不存储 move 内部的中间状态）。
 * 对于 move 内部的部分执行（动画中），用 applyPartialCut。
 */
export function buildCumulativeHeightmaps(
  moves: CutMove[],
  N: number,
  width: number,
  depth: number,
  originX: number,
  originZ: number,
  maxDepth: number,
): Float32Array[] {
  const cols = N + 1
  const count = cols * cols
  const result: Float32Array[] = []
  const current = new Float32Array(count)
  result.push(new Float32Array(current))

  for (const m of moves) {
    if (m.type !== 'rapid') {
      // 在路径上切削
      const steps = Math.max(1, Math.ceil(m.length / Math.max(m.tool.diameter * 0.4, 0.15)))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const p = sampleMovePoint(m, t)
        stampDisc(current, N, width, depth, originX, originZ, p.x, p.y, m.tool, p.z, maxDepth)
      }
    }
    result.push(new Float32Array(current))
  }

  return result
}

/**
 * 应用部分切削：基于上一步的基础高度图，执行当前 move 的前 t 比例。
 * 用于实时动画播放。
 */
export function applyPartialCut(
  target: Float32Array,
  base: Float32Array,
  move: CutMove | undefined,
  t: number,
  N: number,
  width: number,
  depth: number,
  originX: number,
  originZ: number,
  maxDepth: number,
): void {
  target.set(base)
  if (!move || move.type === 'rapid' || t <= 0) return

  const radius = move.tool.diameter / 2
  const stepSize = Math.max(radius * 0.4, 0.15)
  const partialLen = move.length * t
  const steps = Math.max(1, Math.ceil(partialLen / stepSize))

  for (let s = 0; s <= steps; s++) {
    const st = (s / steps) * t
    const p = sampleMovePoint(move, st)
    stampDisc(target, N, width, depth, originX, originZ, p.x, p.y, move.tool, p.z, maxDepth)
  }
}
