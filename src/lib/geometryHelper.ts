import * as THREE from 'three'
import type { GeometryParams } from '../types'

/**
 * 根据参数创建几何体。
 * detail 参数控制细分度，影响顶点数量。
 * 所有几何体居中于原点。
 */
export function createGeometry(params: GeometryParams): THREE.BufferGeometry {
  const { type, size, detail } = params
  const [w, h, d] = size

  // detail 映射到合理的段数（最少2段）
  const seg = (n: number) => Math.max(2, n)

  let geo: THREE.BufferGeometry

  switch (type) {
    case 'cube': {
      geo = new THREE.BoxGeometry(w, h, d, seg(detail), seg(detail), seg(detail))
      break
    }
    case 'sphere': {
      const r = Math.min(w, h, d) / 2
      geo = new THREE.SphereGeometry(r, seg(detail * 2), seg(detail))
      break
    }
    case 'cylinder': {
      const r = Math.min(w, d) / 2
      geo = new THREE.CylinderGeometry(r, r, h, seg(detail * 2), seg(detail))
      break
    }
    case 'cone': {
      const r = Math.min(w, d) / 2
      geo = new THREE.ConeGeometry(r, h, seg(detail * 2), seg(detail))
      break
    }
    case 'torus': {
      const r = Math.min(w, d) / 3
      const tube = h / 4
      geo = new THREE.TorusGeometry(r, tube, seg(detail), seg(detail * 2))
      break
    }
    default: {
      geo = new THREE.BoxGeometry(w, h, d)
    }
  }

  geo.computeBoundingBox()
  geo.computeVertexNormals()
  return geo
}

/**
 * 从几何体提取唯一顶点列表（去重）。
 * 返回局部坐标下的顶点数组。
 */
export function extractUniqueVertices(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const position = geometry.attributes.position
  const set = new Map<string, THREE.Vector3>()

  for (let i = 0; i < position.count; i++) {
    const v = new THREE.Vector3(
      position.getX(i),
      position.getY(i),
      position.getZ(i)
    )
    const key = `${v.x.toFixed(4)}_${v.y.toFixed(4)}_${v.z.toFixed(4)}`
    if (!set.has(key)) {
      set.set(key, v)
    }
  }

  return Array.from(set.values())
}

/**
 * 创建初始默认几何体参数。
 */
export function defaultGeometry(): GeometryParams {
  return {
    type: 'cube',
    size: [4, 4, 4],
    detail: 4,
  }
}
