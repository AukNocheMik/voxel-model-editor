import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import type { VoxelizationResult, VoxelConfig } from '../types'
import { getVoxelColor } from '../lib/voxelizer'

interface VoxelVisualizerProps {
  result: VoxelizationResult | null
  config: VoxelConfig
  /** 是否显示体素边界线框 */
  showEdges: boolean
}

/**
 * 体素可视化组件。
 * 使用 InstancedMesh 高性能渲染大量体素方块。
 *
 * 这是 CNC 模拟切削的基础——每个体素代表一个可被"切除"的最小单元。
 * 后续切削模拟只需将对应位置的体素标记为 solid=false 即可。
 */
export default function VoxelVisualizer({
  result,
  config,
  showEdges,
}: VoxelVisualizerProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const edgesRef = useRef<THREE.InstancedMesh>(null!)

  const solidVoxels = useMemo(() => {
    if (!result) return []
    return result.voxels.filter((v) => v.solid)
  }, [result])

  // 体素几何体（带间隙）
  const boxGeo = useMemo(() => {
    const gapScale = 1 - config.gap
    const geo = new THREE.BoxGeometry(gapScale, gapScale, gapScale)
    return geo
  }, [config.gap])

  // 边线几何体
  const edgesGeo = useMemo(() => {
    return new THREE.EdgesGeometry(boxGeo)
  }, [boxGeo])

  // 更新 InstancedMesh
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !result) return

    const center = new THREE.Vector3()
    result.bounds.getCenter(center)
    const maxDist = result.cellSize * result.resolution * 0.5

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()

    solidVoxels.forEach((voxel, i) => {
      dummy.position.set(...voxel.position)
      dummy.scale.setScalar(voxel.size)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      if (config.colorGradient) {
        const c = getVoxelColor(voxel.position, center, maxDist)
        color.copy(c)
      } else {
        color.setHex(0x4ecdc4)
      }
      mesh.setColorAt(i, color)
    })

    mesh.count = solidVoxels.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [solidVoxels, result, config.colorGradient])

  // 更新边线 InstancedMesh
  useEffect(() => {
    const edges = edgesRef.current
    if (!edges || !result) return

    const dummy = new THREE.Object3D()
    solidVoxels.forEach((voxel, i) => {
      dummy.position.set(...voxel.position)
      dummy.scale.setScalar(voxel.size)
      dummy.updateMatrix()
      edges.setMatrixAt(i, dummy.matrix)
    })
    edges.count = solidVoxels.length
    edges.instanceMatrix.needsUpdate = true
  }, [solidVoxels, result])

  if (!result || solidVoxels.length === 0) {
    return null
  }

  // InstancedMesh 需要预分配足够大的数量
  const maxCount = Math.max(solidVoxels.length, 1)

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[boxGeo, undefined, maxCount]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.5}
          metalness={0.2}
          transparent
          opacity={0.92}
        />
      </instancedMesh>

      {showEdges && (
        <instancedMesh ref={edgesRef} args={[edgesGeo, undefined, maxCount]}>
          <lineBasicMaterial color="#1a3a4a" transparent opacity={0.4} />
        </instancedMesh>
      )}
    </group>
  )
}
