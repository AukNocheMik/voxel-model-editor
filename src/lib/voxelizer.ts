import * as THREE from 'three'
import type { Voxel, VoxelConfig, VoxelizationResult } from '../types'

/**
 * 判断一个点是否在几何体（Mesh）内部。
 *
 * 方法：从该点沿 +X 方向发射射线，统计与几何体表面相交次数。
 * - 奇数次 = 在内部
 * - 偶数次 = 在外部
 *
 * 这是经典的射线投射点包含测试（ray-in-volume test），
 * 适用于任意闭合曲面，包括经顶点编辑变形后的模型。
 */
const _raycaster = new THREE.Raycaster()
const _origin = new THREE.Vector3()
const _dir = new THREE.Vector3(1, 0, 0)

function isPointInsideMesh(
  point: THREE.Vector3,
  mesh: THREE.Mesh,
  raycaster: THREE.Raycaster
): boolean {
  _origin.copy(point)
  raycaster.set(_origin, _dir)
  raycaster.firstHitOnly = true // 仅对 BVH / 加速结构有效，标准 mesh 忽略

  const intersects = raycaster.intersectObject(mesh, false)
  // 使用奇偶规则判断
  return intersects.length % 2 === 1
}

/**
 * 高性能版本：批量判断网格点是否在 mesh 内部。
 *
 * 为了提升性能，我们对每个网格列（固定 y,z）一次性做一次射线投射，
 * 然后根据所有交点的 x 坐标排序，来判断该列上每个 x 点的内外状态。
 * 这将复杂度从 O(N³ × raycast) 降低到 O(N² × raycast)。
 */
function batchVoxelizeAxis(
  mesh: THREE.Mesh,
  bounds: THREE.Box3,
  resolution: number,
  cellSize: THREE.Vector3
): boolean[][][] {
  const min = bounds.min
  const solid = Array.from({ length: resolution }, () =>
    Array.from({ length: resolution }, () =>
      new Array<boolean>(resolution).fill(false)
    )
  )

  const raycaster = new THREE.Raycaster()
  const origin = new THREE.Vector3()
  // 沿 +X 方向发射
  const dir = new THREE.Vector3(1, 0, 0)
  raycaster.far = cellSize.x * resolution + 1

  // 半个 cell 偏移，采样体素中心
  const halfX = cellSize.x / 2
  const halfY = cellSize.y / 2
  const halfZ = cellSize.z / 2

  for (let j = 0; j < resolution; j++) {
    // y
    const py = min.y + halfY + j * cellSize.y
    for (let k = 0; k < resolution; k++) {
      // z
      const pz = min.z + halfZ + k * cellSize.z
      origin.set(min.x - 0.01, py, pz)
      raycaster.set(origin, dir)

      const intersects = raycaster.intersectObject(mesh, false)
      if (intersects.length === 0) continue

      // 收集所有交点的 x 坐标并排序
      const xs = intersects.map((h) => h.point.x).sort((a, b) => a - b)

      // 对每个 x 体素，用奇偶规则判断
      for (let i = 0; i < resolution; i++) {
        const px = min.x + halfX + i * cellSize.x
        // 统计小于 px 的交点数量
        let count = 0
        for (const x of xs) {
          if (x < px) count++
          else break
        }
        if (count % 2 === 1) {
          solid[i][j][k] = true
        }
      }
    }
  }

  return solid
}

/**
 * 从 solid 数组中提取仅表面体素（至少有一个邻居为空）。
 */
function extractShell(
  solid: boolean[][][],
  resolution: number
): boolean[][][] {
  const shell = Array.from({ length: resolution }, () =>
    Array.from({ length: resolution }, () =>
      new Array<boolean>(resolution).fill(false)
    )
  )

  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      for (let k = 0; k < resolution; k++) {
        if (!solid[i][j][k]) continue
        // 检查 6 邻居，任一为空（或越界）则为表面
        const neighbors = [
          [i - 1, j, k], [i + 1, j, k],
          [i, j - 1, k], [i, j + 1, k],
          [i, j, k - 1], [i, j, k + 1],
        ]
        let isShell = false
        for (const [ni, nj, nk] of neighbors) {
          if (ni < 0 || ni >= resolution || nj < 0 || nj >= resolution || nk < 0 || nk >= resolution) {
            isShell = true
            break
          }
          if (!solid[ni][nj][nk]) {
            isShell = true
            break
          }
        }
        shell[i][j][k] = isShell
      }
    }
  }
  return shell
}

/**
 * 主体素化函数：将 mesh 转换为体素集合。
 *
 * @param mesh  目标网格（可以是经顶点编辑变形后的）
 * @param config  体素配置
 * @returns  体素化结果
 */
export function voxelizeMesh(
  mesh: THREE.Mesh,
  config: VoxelConfig
): VoxelizationResult {
  const { resolution, shellOnly } = config

  // 1. 计算包围盒
  mesh.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(mesh)
  // 稍微扩大一点避免边界问题
  bounds.expandByScalar(0.01)

  const size = new THREE.Vector3()
  bounds.getSize(size)

  // 2. 计算每个体素的尺寸（取最大维度作为基准，保证各向同性立方体体素）
  const maxSize = Math.max(size.x, size.y, size.z)
  const cellSize = new THREE.Vector3(maxSize, maxSize, maxSize).divideScalar(resolution)

  // 3. 重新计算居中的包围盒（使体素网格是立方体）
  const center = new THREE.Vector3()
  bounds.getCenter(center)
  const half = maxSize / 2
  const centeredBounds = new THREE.Box3(
    new THREE.Vector3(center.x - half, center.y - half, center.z - half),
    new THREE.Vector3(center.x + half, center.y + half, center.z + half)
  )

  // 4. 批量射线投射体素化
  const solid = batchVoxelizeAxis(mesh, centeredBounds, resolution, cellSize)

  // 5. 如果只需外壳
  const finalSolid = shellOnly ? extractShell(solid, resolution) : solid

  // 6. 生成体素列表
  const voxels: Voxel[] = []
  const min = centeredBounds.min
  const halfX = cellSize.x / 2
  const halfY = cellSize.y / 2
  const halfZ = cellSize.z / 2

  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      for (let k = 0; k < resolution; k++) {
        if (finalSolid[i][j][k]) {
          voxels.push({
            position: [
              min.x + halfX + i * cellSize.x,
              min.y + halfY + j * cellSize.y,
              min.z + halfZ + k * cellSize.z,
            ],
            size: cellSize.x,
            solid: true,
          })
        }
      }
    }
  }

  // 7. 统计
  const totalCells = resolution * resolution * resolution
  const solidCount = voxels.length

  return {
    voxels,
    bounds: centeredBounds,
    cellSize: cellSize.x,
    resolution,
    stats: {
      total: totalCells,
      solid: solidCount,
      ratio: totalCells > 0 ? solidCount / totalCells : 0,
    },
  }
}

/**
 * 根据体素到中心的距离生成渐变颜色。
 * 用于可视化时提供更丰富的视觉效果。
 */
export function getVoxelColor(
  position: [number, number, number],
  center: THREE.Vector3,
  maxDist: number
): THREE.Color {
  const pos = new THREE.Vector3(...position)
  const dist = pos.distanceTo(center)
  const t = Math.min(dist / maxDist, 1)

  // 从青色 -> 蓝色 -> 紫色 的渐变
  const color = new THREE.Color()
  color.setHSL(0.5 - t * 0.2, 0.8, 0.4 + t * 0.2)
  return color
}
